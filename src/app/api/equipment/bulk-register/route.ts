/**
 * POST /api/equipment/bulk-register — wizard endpoint that creates N
 * Equipment rows of identical configuration plus an INSTALLATION Visit
 * per row at each row's own installedAt. Does NOT create a contract —
 * contract linkage is a separate post-install step.
 *
 * Body (validated by bulkRegisterEquipmentSchema):
 *   customerId, siteId?, modelId, serviceType, managementType, deposit,
 *   monthlyFee, customInspectionCycle?, defaultInstalledAt,
 *   installedByTechnicianId?, installNotes?,
 *   rows: [{ serialNumber?, assetCode?, installedAt, notes? }],
 *   serviceConfig: { inspectionCycleMonths?, filterOverrides[] }
 *
 * Returns: { equipmentIds, visitIds, summary: { count, byInstallDate } }
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { bulkRegisterEquipmentSchema } from "@/lib/validators/equipment";
import { logAudit } from "@/lib/audit";
import { allocateContractCode } from "@/lib/contracts/code";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot register equipment");
    }
    const body = await request.json().catch(() => null);
    const parsed = bulkRegisterEquipmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid bulk register payload",
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

    const lifecycleStage =
      data.serviceType === "RENTAL" ? "IN_RENTAL" : "IN_MAINTENANCE";

    const result = await prisma.$transaction(async (tx) => {
      const equipmentIds: string[] = [];
      const visitIds: string[] = [];
      const dateCounts = new Map<string, number>();

      for (const row of data.rows) {
        // Generate auto-serial when missing.
        const equipment = await tx.equipment.create({
          data: {
            customerId: data.customerId,
            siteId: data.siteId ?? null,
            modelId: data.modelId,
            serialNumber: row.serialNumber ?? null,
            assetCode: row.assetCode ?? null,
            installedAt: row.installedAt,
            installedByTechnicianId: data.installedByTechnicianId ?? null,
            status: "ACTIVE",
            ownership: data.serviceType === "SALE" ? "CUSTOMER" : "COMPANY",
            serviceType: data.serviceType,
            managementType: data.managementType,
            lifecycleStage,
            deposit: data.deposit ?? null,
            monthlyFee: data.monthlyFee ?? null,
            customInspectionCycle:
              data.customInspectionCycle ??
              data.serviceConfig?.inspectionCycleMonths ??
              null,
            registeredById: auth.userId,
            notes: row.notes ?? data.installNotes ?? null,
          },
        });
        equipmentIds.push(equipment.id);

        // Filter overrides — create EquipmentConsumable rows.
        for (const f of data.serviceConfig?.filterOverrides ?? []) {
          await tx.equipmentConsumable.create({
            data: {
              equipmentId: equipment.id,
              consumableId: f.consumableId,
              replaceEveryMonths: f.replaceEveryMonths,
              quantity: f.quantity,
            },
          });
        }

        // INSTALLATION Visit — state=SCHEDULED (mockup confirmation: 설치 예정).
        const visit = await tx.visit.create({
          data: {
            customerId: data.customerId,
            siteId: data.siteId ?? null,
            equipmentId: equipment.id,
            type: "INSTALLATION",
            state: "SCHEDULED",
            scheduledFor: row.installedAt,
            leadTechnicianId: data.installedByTechnicianId ?? null,
            expectedAmount: data.deposit ?? null,
          },
        });
        visitIds.push(visit.id);

        const key = row.installedAt.toISOString().slice(0, 10);
        dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
      }

      // Optional: mint a Contract that bundles every equipment row.
      // Period + price fields are derived from the wizard's serviceType +
      // per-unit deposit/monthlyFee × N. Period starts at the earliest
      // installedAt so the contract opens on the same day as the first
      // INSTALLATION visit.
      let contractId: string | null = null;
      let contractNumber: string | null = null;
      if (data.createContract && equipmentIds.length > 0) {
        const installDates = data.rows.map((r) => r.installedAt.getTime());
        const earliestInstall = new Date(Math.min(...installDates));
        const term = data.contractTermMonths ?? null;
        const endDate = term
          ? new Date(
              new Date(earliestInstall).setMonth(
                earliestInstall.getMonth() + term,
              ),
            )
          : null;
        const perUnitDeposit = Number(data.deposit ?? 0);
        const perUnitMonthlyFee = Number(data.monthlyFee ?? 0);
        const totalDeposit = perUnitDeposit * equipmentIds.length;
        const totalMonthlyFee = perUnitMonthlyFee * equipmentIds.length;
        let totalContractValue: number | null = null;
        if (data.serviceType === "SALE") {
          // SALE: total = unit price × quantity. There's no rental flow,
          // so monthlyFee is interpreted as the per-unit sale price.
          totalContractValue = perUnitMonthlyFee * equipmentIds.length;
        } else if (term) {
          totalContractValue = totalDeposit + totalMonthlyFee * term;
        }

        // Allocate contract number. Retry on the unlikely unique-key
        // collision (two reps writing identical-day B2B contracts).
        let attempt = 0;
        while (attempt < 5) {
          const code = allocateContractCode({
            customer: {
              type: customer.type,
              code: customer.code,
              shortcode: customer.shortcode,
            },
            type: data.serviceType,
            signedAt: earliestInstall,
          });
          // For B2C the helper returns the customer-suffix code which is
          // already unique-per-day; in case staff re-runs the wizard for
          // the same customer + day, fall through to a `-N` suffix.
          const candidate = attempt === 0 ? code : `${code}-${attempt + 1}`;
          try {
            const contract = await tx.contract.create({
              data: {
                contractNumber: candidate,
                customerId: data.customerId,
                type: data.serviceType,
                state: "ACTIVE",
                startDate: earliestInstall,
                endDate,
                termMonths: term,
                monthlyMaintenanceFee:
                  data.serviceType === "SALE" ? null : totalMonthlyFee,
                totalContractValue,
                deposit: data.serviceType === "RENTAL" ? totalDeposit : null,
                endOfTermAction:
                  data.serviceType === "RENTAL" ? "TRANSFER_OWNERSHIP" : null,
                signedByCustomerAt: earliestInstall,
                signedByCompanyAt: earliestInstall,
                activatedAt: earliestInstall,
                equipment: {
                  create: equipmentIds.map((eqId) => ({
                    equipmentId: eqId,
                    unitPrice: perUnitMonthlyFee || null,
                    quantity: 1,
                  })),
                },
              },
            });
            contractId = contract.id;
            contractNumber = contract.contractNumber;
            break;
          } catch (err) {
            const isP2002 =
              err && typeof err === "object" && "code" in err &&
              (err as { code: string }).code === "P2002";
            if (!isP2002) throw err;
            attempt += 1;
          }
        }
      }

      return {
        equipmentIds,
        visitIds,
        contractId,
        contractNumber,
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
        modelId: data.modelId,
        count: result.equipmentIds.length,
        equipmentIds: result.equipmentIds,
        visitIds: result.visitIds,
        contractId: result.contractId,
        contractNumber: result.contractNumber,
        byInstallDate: result.byInstallDate,
        serviceType: data.serviceType,
        managementType: data.managementType,
      },
      request,
    });

    return successResponse({
      equipmentIds: result.equipmentIds,
      visitIds: result.visitIds,
      contractId: result.contractId,
      contractNumber: result.contractNumber,
      summary: {
        count: result.equipmentIds.length,
        byInstallDate: result.byInstallDate,
      },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
