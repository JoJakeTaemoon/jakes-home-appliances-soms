/**
 * POST /api/equipment/register — multi-model install wizard endpoint.
 *
 * Accepts N lines (model × serviceType × price × quantity). For each
 * line creates `quantity` Equipment rows + one INSTALLATION Visit per
 * row (state=SCHEDULED, scheduledFor = line.installedAt or the wizard
 * default). When createContract=true mints a single Contract bundling
 * every generated equipment id across all lines.
 *
 * Contract.type rule when lines mix service types:
 *   - explicit `contractServiceType` from the body wins
 *   - otherwise: RENTAL if any line is RENTAL, else MAINTENANCE if any
 *     line is MAINTENANCE, else SALE.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { registerEquipmentSchema } from "@/lib/validators/equipment";
import { logAudit } from "@/lib/audit";
import { allocateContractCode } from "@/lib/contracts/code";

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

function pickContractType(
  lines: Array<{ serviceType: "RENTAL" | "MAINTENANCE" | "SALE" }>,
  override: "RENTAL" | "MAINTENANCE" | "SALE" | undefined,
): "RENTAL" | "MAINTENANCE" | "SALE" {
  if (override) return override;
  if (lines.some((l) => l.serviceType === "RENTAL")) return "RENTAL";
  if (lines.some((l) => l.serviceType === "MAINTENANCE")) return "MAINTENANCE";
  return "SALE";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot register equipment");
    }
    const body = await request.json().catch(() => null);
    const parsed = registerEquipmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid register payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, code: true, type: true, shortcode: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    if (data.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: data.siteId, customerId: data.customerId },
        select: { id: true },
      });
      if (!site) throw new ValidationError("Site does not belong to customer");
    }

    // Sanity-check every modelId before we open the transaction.
    const modelIds = Array.from(new Set(data.lines.map((l) => l.modelId)));
    const modelRows = await prisma.equipmentModel.findMany({
      where: { id: { in: modelIds } },
      select: { id: true, modelCode: true },
    });
    const modelByIdMap = new Map(modelRows.map((m) => [m.id, m]));
    for (const l of data.lines) {
      if (!modelByIdMap.has(l.modelId)) {
        throw new ValidationError(`Unknown modelId: ${l.modelId}`);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const equipmentIds: string[] = [];
      const visitIds: string[] = [];
      // Aggregated totals — fed into Contract caches when createContract.
      let totalDeposit = 0;
      let totalMonthlyFee = 0;
      let totalSaleValue = 0;
      const dateCounts = new Map<string, number>();
      let earliestInstall: Date = data.defaultInstalledAt;

      for (const line of data.lines) {
        const lineInstall = line.installedAt ?? data.defaultInstalledAt;
        if (lineInstall.getTime() < earliestInstall.getTime()) {
          earliestInstall = lineInstall;
        }
        const lifecycleStage =
          line.serviceType === "RENTAL" ? "IN_RENTAL" : "IN_MAINTENANCE";
        const modelCode = modelByIdMap.get(line.modelId)?.modelCode ?? "AQS";
        const yy = String(lineInstall.getFullYear()).slice(-2);
        const mm = String(lineInstall.getMonth() + 1).padStart(2, "0");
        const dd = String(lineInstall.getDate()).padStart(2, "0");

        for (let i = 0; i < line.quantity; i++) {
          const serial = line.serialPrefix
            ? `${line.serialPrefix}${String(i + 1).padStart(4, "0")}`
            : `${modelCode}${yy}${mm}${dd}${String(i + 1).padStart(4, "0")}`;
          const equipment = await tx.equipment.create({
            data: {
              customerId: data.customerId,
              siteId: data.siteId ?? null,
              modelId: line.modelId,
              serialNumber: serial,
              installedAt: lineInstall,
              installedByTechnicianId: data.installedByTechnicianId ?? null,
              status: "ACTIVE",
              ownership: line.serviceType === "SALE" ? "CUSTOMER" : "COMPANY",
              serviceType: line.serviceType,
              managementType: line.managementType,
              lifecycleStage,
              deposit: line.deposit ?? null,
              // monthlyFee is rent/maintenance only — SALE lines carry their
              // price in salePrice/installFee instead (no more overloading).
              monthlyFee: line.serviceType === "SALE" ? null : line.monthlyFee ?? null,
              salePrice: line.salePrice ?? null,
              installFee: line.installFee ?? null,
              customInspectionCycleDays: line.serviceConfig?.inspectionCycleDays ?? null,
              registeredById: auth.userId,
              notes: line.notes ?? data.installNotes ?? null,
            },
          });
          equipmentIds.push(equipment.id);

          // Filter overrides — one EquipmentConsumable row per
          // serviceConfig.filters entry (consumableId XOR customName).
          for (const f of line.serviceConfig?.filters ?? []) {
            await tx.equipmentConsumable.create({
              data: {
                equipmentId: equipment.id,
                consumableId: f.consumableId ?? null,
                customName: f.customName ?? null,
                quantity: f.quantity,
                replaceEveryDays: f.useCycleDays,
              },
            });
          }

          const visit = await tx.visit.create({
            data: {
              customerId: data.customerId,
              siteId: data.siteId ?? null,
              equipmentId: equipment.id,
              type: "INSTALLATION",
              state: "SCHEDULED",
              scheduledFor: lineInstall,
              leadTechnicianId: data.installedByTechnicianId ?? null,
              expectedAmount: line.deposit ?? null,
            },
          });
          visitIds.push(visit.id);

          if (line.serviceType === "SALE") {
            totalSaleValue += Number(line.salePrice ?? 0) + Number(line.installFee ?? 0);
          } else {
            totalDeposit += Number(line.deposit ?? 0);
            totalMonthlyFee += Number(line.monthlyFee ?? 0);
          }

          const key = lineInstall.toISOString().slice(0, 10);
          dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
        }
      }

      // Optional Contract minted in the same transaction. See doc-comment
      // for contract-type derivation.
      let contractId: string | null = null;
      let contractNumber: string | null = null;
      if (data.createContract && equipmentIds.length > 0) {
        const type = pickContractType(data.lines, data.contractServiceType);
        const term = data.contractTermMonths ?? null;
        // Manual 계약일 (contractDate) wins when the wizard set one;
        // otherwise fall back to the earliest line's installedAt — mirrors
        // bulk-register/route.ts's contractStartDate (Task 2a.6).
        const contractStartDate = data.contractDate ?? earliestInstall;
        const endDate = term
          ? new Date(
              new Date(contractStartDate).setMonth(
                contractStartDate.getMonth() + term,
              ),
            )
          : null;
        // Deposit is collected/tracked separately (contract.deposit below) —
        // excluded from totalContractValue.
        let totalContractValue: number | null = null;
        if (type === "SALE") {
          totalContractValue = totalSaleValue;
        } else if (term) {
          totalContractValue = totalMonthlyFee * term;
        }

        const buildContractData = (candidateNumber: string) => ({
          contractNumber: candidateNumber,
          customerId: data.customerId,
          type,
          state: "ACTIVE" as const,
          startDate: contractStartDate,
          endDate,
          termMonths: term,
          monthlyMaintenanceFee: type === "SALE" ? null : totalMonthlyFee,
          totalContractValue,
          deposit: type === "RENTAL" ? totalDeposit : null,
          endOfTermAction: type === "RENTAL" ? ("TRANSFER_OWNERSHIP" as const) : null,
          signedByCustomerAt: contractStartDate,
          signedByCompanyAt: contractStartDate,
          activatedAt: contractStartDate,
          equipment: {
            create: equipmentIds.map((eqId) => ({
              equipmentId: eqId,
              quantity: 1,
            })),
          },
        });

        if (data.contractNumber) {
          // Manual contract number — pre-check to avoid the collision
          // aborting this transaction (Postgres can't recover from a
          // failed INSERT mid-transaction, so we can't catch-and-retry).
          // Duplicate found by the pre-check → 400; a genuine race between
          // the pre-check and our own INSERT → 409 (caller should retry).
          const existing = await tx.contract.findUnique({
            where: { contractNumber: data.contractNumber },
            select: { id: true },
          });
          if (existing) {
            throw new ValidationError("Contract number already exists");
          }
          try {
            const contract = await tx.contract.create({
              data: buildContractData(data.contractNumber),
            });
            contractId = contract.id;
            contractNumber = contract.contractNumber;
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            throw new ConflictError(
              "Contract number allocation raced with a concurrent request — please retry",
            );
          }
        } else {
          // Auto-allocate — pre-check each `-N` candidate with a SELECT
          // before INSERTing (read-your-own-writes covers siblings created
          // earlier in this same transaction). Postgres aborts the whole
          // interactive transaction on a failed INSERT, so a catch-and-
          // retry-INSERT loop can't recover — see bulk-register/route.ts's
          // createContractRow for the identical pattern.
          const code = allocateContractCode({
            customer: {
              type: customer.type,
              code: customer.code,
              shortcode: customer.shortcode,
            },
            type,
            signedAt: contractStartDate,
          });
          let attempt = 0;
          while (attempt < 5) {
            const candidate = attempt === 0 ? code : `${code}-${attempt + 1}`;
            const existing = await tx.contract.findUnique({
              where: { contractNumber: candidate },
              select: { id: true },
            });
            if (!existing) {
              try {
                const contract = await tx.contract.create({
                  data: buildContractData(candidate),
                });
                contractId = contract.id;
                contractNumber = contract.contractNumber;
                break;
              } catch (err) {
                if (!isUniqueViolation(err)) throw err;
                // A concurrent request won the race between our pre-check
                // SELECT and this INSERT — surface a clean 409 instead of
                // retrying (Postgres can't retry mid-aborted-transaction).
                throw new ConflictError(
                  "Contract number allocation raced with a concurrent request — please retry",
                );
              }
            }
            attempt += 1;
          }
          if (!contractId) {
            throw new Error(
              "Failed to allocate a unique contract number after 5 attempts",
            );
          }
        }
      }

      return {
        equipmentIds,
        visitIds,
        contractId,
        contractNumber,
        totals: { totalDeposit, totalMonthlyFee, totalSaleValue },
        byInstallDate: Object.fromEntries(dateCounts.entries()),
      };
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_BULK_CREATE",
      entityType: "Equipment",
      entityId: result.equipmentIds[0] ?? null,
      after: {
        customerId: data.customerId,
        lineCount: data.lines.length,
        modelIds,
        count: result.equipmentIds.length,
        equipmentIds: result.equipmentIds,
        visitIds: result.visitIds,
        contractId: result.contractId,
        contractNumber: result.contractNumber,
        byInstallDate: result.byInstallDate,
      },
      request,
    });

    return successResponse(
      {
        equipmentIds: result.equipmentIds,
        visitIds: result.visitIds,
        contractId: result.contractId,
        contractNumber: result.contractNumber,
        summary: {
          count: result.equipmentIds.length,
          byInstallDate: result.byInstallDate,
          totals: result.totals,
        },
      },
      201,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
