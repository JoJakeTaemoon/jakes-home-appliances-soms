/**
 * POST /api/equipment/bulk-register — 4-step wizard endpoint. Creates N
 * Equipment rows of identical configuration plus an INSTALLATION Visit per
 * row at each row's own installedAt, and (when `createContract`) the
 * Contract(s) that bundle every generated equipment id — see
 * `planContractRows` for exactly which contract(s) get minted.
 *
 * Body (validated by bulkRegisterEquipmentSchema):
 *   customerId, siteId?, modelId, serviceType, managementType, deposit,
 *   monthlyFee, customInspectionCycleDays?, defaultInstalledAt,
 *   installedByTechnicianId?, installNotes?,
 *   rows: [{ serialNumber?, assetCode?, installedAt, notes? }],
 *   serviceConfig: { inspectionCycleDays?, filters: [{ consumableId? |
 *     customName?, quantity, useCycleDays }] },
 *   contractNumber?, contractDate? (YYYY-MM-DD; defaults to the earliest
 *   row's installedAt when absent), salePrice?, installFee?, monthlyRent?,
 *   monthlyMaintenanceFee?, hasContract? (SALE only),
 *   createContract, contractTermMonths?
 *
 * Returns: { equipmentIds, visitIds, contractId, contractNumber,
 *   contractIds, summary: { count, byInstallDate } }
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
import { bulkRegisterEquipmentSchema } from "@/lib/validators/equipment";
import { logAudit } from "@/lib/audit";
import { allocateContractCode } from "@/lib/contracts/code";
import type { BulkRegisterEquipmentInput } from "@/lib/validators/equipment";
import type { Prisma } from "@/generated/prisma";

/** Per-unit Equipment.monthlyFee: rent for RENTAL, maintenance fee for
 *  MAINTENANCE, always null for SALE. Falls back to the legacy generic
 *  `monthlyFee` field for back-compat with callers that haven't moved to
 *  the split monthlyRent/monthlyMaintenanceFee fields yet. */
function resolveEquipmentMonthlyFee(
  data: BulkRegisterEquipmentInput,
): number | null {
  if (data.serviceType === "SALE") return null;
  if (data.serviceType === "RENTAL") return data.monthlyRent ?? data.monthlyFee ?? null;
  return data.monthlyMaintenanceFee ?? data.monthlyFee ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

/** One Contract row to mint — SALE+FULL_SERVICE ("유지보수 등록") produces two
 *  of these (SALE + MAINTENANCE); every other serviceType produces one. */
interface ContractRowPlan {
  type: "SALE" | "RENTAL" | "MAINTENANCE";
  /** Manual contract number — only ever set on ONE row per request (the
   *  SALE row when a SALE+MAINTENANCE pair is minted). */
  manualNumber?: string;
  termMonths: number | null;
  totalContractValue: number | null;
  monthlyMaintenanceFee: number | null;
  deposit: number | null;
  unitPrice: number | null;
}

/**
 * Creates one Contract + its ContractEquipment rows bundling every
 * generated equipment id. Manual contract numbers are used verbatim (P2002
 * → ValidationError, no auto-suffix); auto-allocated numbers retry with a
 * `-N` suffix on the unlikely same-day collision.
 */
async function createContractRow(
  tx: Prisma.TransactionClient,
  opts: {
    customerId: string;
    customer: { type: "B2C" | "B2B"; code: string; shortcode: string | null };
    equipmentIds: string[];
    /** Manual 계약일 when the wizard set one; otherwise the earliest row's
     *  installedAt (pre-2a.6 fallback behavior) — see contractStartDate in
     *  the POST handler. */
    contractStartDate: Date;
    plan: ContractRowPlan;
  },
) {
  const { customerId, customer, equipmentIds, contractStartDate, plan } = opts;
  const endDate = plan.termMonths
    ? new Date(
        new Date(contractStartDate).setMonth(
          contractStartDate.getMonth() + plan.termMonths,
        ),
      )
    : null;

  const buildData = (contractNumber: string) => ({
    contractNumber,
    customerId,
    type: plan.type,
    state: "ACTIVE" as const,
    startDate: contractStartDate,
    endDate,
    termMonths: plan.termMonths,
    monthlyMaintenanceFee: plan.monthlyMaintenanceFee,
    totalContractValue: plan.totalContractValue,
    deposit: plan.deposit,
    endOfTermAction: plan.type === "RENTAL" ? ("TRANSFER_OWNERSHIP" as const) : null,
    signedByCustomerAt: contractStartDate,
    signedByCompanyAt: contractStartDate,
    activatedAt: contractStartDate,
    equipment: {
      create: equipmentIds.map((eqId) => ({
        equipmentId: eqId,
        unitPrice: plan.unitPrice,
        quantity: 1,
      })),
    },
  });

  if (plan.manualNumber) {
    try {
      return await tx.contract.create({ data: buildData(plan.manualNumber) });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw new ValidationError("Contract number already exists");
    }
  }

  // Auto-allocate. allocateContractCode ignores `type` (the code is keyed
  // off customer + day only), so a same-customer same-day SALE +
  // companion MAINTENANCE pair always collides on the base code — and a
  // Postgres transaction can't recover from a failed INSERT without a
  // rollback, so a catch-and-retry-insert loop would abort the whole
  // wizard transaction. Pre-check each `-N` candidate with a SELECT
  // instead (read-your-own-writes sees the sibling contract created
  // earlier in this same transaction) and only INSERT once a free slot
  // is found.
  const code = allocateContractCode({
    customer,
    type: plan.type,
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
        return await tx.contract.create({ data: buildData(candidate) });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // A different request won the race between our pre-check SELECT and
        // this INSERT (the pre-check loop only guarantees uniqueness against
        // writes already made in THIS transaction, e.g. the sibling
        // SALE/MAINTENANCE row). Postgres aborts the whole interactive
        // transaction on a failed statement, so we can't retry the next `-N`
        // suffix in place — surface a clean 409 instead of the raw P2002.
        throw new ConflictError(
          "Contract number allocation raced with a concurrent request — please retry",
        );
      }
    }
    attempt += 1;
  }
  throw new Error("Failed to allocate a unique contract number after 5 attempts");
}

/**
 * Decides which Contract(s) the wizard should mint for this request.
 *   - RENTAL / MAINTENANCE: always exactly one (of the same type).
 *   - SALE, managementType=FULL_SERVICE ("유지보수 등록"): SALE contract only
 *     when hasContract, PLUS a MAINTENANCE contract unconditionally. A
 *     supplied contractNumber is used for the SALE row only — the
 *     MAINTENANCE row always auto-allocates.
 *   - SALE, other managementType: SALE contract only when hasContract (0 or 1).
 */
function planContractRows(
  data: BulkRegisterEquipmentInput,
  unitCount: number,
): ContractRowPlan[] {
  const term = data.contractTermMonths ?? null;
  const totalDeposit = Number(data.deposit ?? 0) * unitCount;
  const perUnitMonthlyRent = Number(data.monthlyRent ?? data.monthlyFee ?? 0);
  const totalMonthlyRent = perUnitMonthlyRent * unitCount;
  const perUnitMaintenanceFee = Number(data.monthlyMaintenanceFee ?? data.monthlyFee ?? 0);
  const totalMaintenanceFee = perUnitMaintenanceFee * unitCount;
  const perUnitSalePrice = Number(data.salePrice ?? 0);
  const totalSaleValue = perUnitSalePrice * unitCount + Number(data.installFee ?? 0) * unitCount;

  if (data.serviceType === "RENTAL") {
    return [{
      type: "RENTAL",
      manualNumber: data.contractNumber,
      termMonths: term,
      // Deposit is collected/tracked separately — excluded from totalContractValue.
      totalContractValue: term ? totalMonthlyRent * term : null,
      monthlyMaintenanceFee: totalMonthlyRent,
      deposit: totalDeposit,
      unitPrice: perUnitMonthlyRent || null,
    }];
  }

  if (data.serviceType === "MAINTENANCE") {
    return [{
      type: "MAINTENANCE",
      manualNumber: data.contractNumber,
      termMonths: term,
      totalContractValue: totalMaintenanceFee,
      monthlyMaintenanceFee: totalMaintenanceFee,
      deposit: null,
      unitPrice: perUnitMaintenanceFee || null,
    }];
  }

  // SALE
  const plans: ContractRowPlan[] = [];
  if (data.hasContract) {
    plans.push({
      type: "SALE",
      manualNumber: data.contractNumber,
      termMonths: null,
      totalContractValue: totalSaleValue,
      monthlyMaintenanceFee: null,
      deposit: null,
      unitPrice: perUnitSalePrice || null,
    });
  }
  if (data.managementType === "FULL_SERVICE") {
    plans.push({
      type: "MAINTENANCE",
      manualNumber: undefined,
      termMonths: term,
      totalContractValue: totalMaintenanceFee,
      monthlyMaintenanceFee: totalMaintenanceFee,
      deposit: null,
      unitPrice: perUnitMaintenanceFee || null,
    });
  }
  return plans;
}

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
            monthlyFee: resolveEquipmentMonthlyFee(data),
            installFee: data.installFee ?? null,
            salePrice: data.salePrice ?? null,
            customInspectionCycleDays:
              data.serviceConfig?.inspectionCycleDays ??
              data.customInspectionCycleDays ??
              null,
            registeredById: auth.userId,
            notes: row.notes ?? data.installNotes ?? null,
          },
        });
        equipmentIds.push(equipment.id);

        // Filter overrides — create one EquipmentConsumable row per
        // serviceConfig.filters entry. Each line is either a catalog
        // consumable (consumableId) or a free-text custom part
        // (customName) — validator enforces exactly one is set.
        for (const f of data.serviceConfig?.filters ?? []) {
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

      // Optional: mint the Contract(s) that bundle every equipment row.
      // Which contract(s) and their price fields are derived from the
      // wizard's serviceType/managementType/hasContract — see
      // planContractRows. Period starts at the earliest installedAt so the
      // contract opens on the same day as the first INSTALLATION visit.
      const contracts: { id: string; contractNumber: string }[] = [];
      if (data.createContract && equipmentIds.length > 0) {
        const installDates = data.rows.map((r) => r.installedAt.getTime());
        const earliestInstall = new Date(Math.min(...installDates));
        // Manual 계약일 (contractDate) wins when the wizard set one;
        // otherwise fall back to the earliest row's installedAt.
        const contractStartDate = data.contractDate ?? earliestInstall;
        const plans = planContractRows(data, equipmentIds.length);
        for (const plan of plans) {
          const contract = await createContractRow(tx, {
            customerId: data.customerId,
            customer: {
              type: customer.type,
              code: customer.code,
              shortcode: customer.shortcode,
            },
            equipmentIds,
            contractStartDate,
            plan,
          });
          contracts.push(contract);
        }
      }

      return {
        equipmentIds,
        visitIds,
        // Primary contract = first minted (the SALE row when a SALE +
        // MAINTENANCE pair is created) — kept for back-compat.
        contractId: contracts[0]?.id ?? null,
        contractNumber: contracts[0]?.contractNumber ?? null,
        contractIds: contracts.map((c) => c.id),
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
        contractIds: result.contractIds,
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
      contractIds: result.contractIds,
      summary: {
        count: result.equipmentIds.length,
        byInstallDate: result.byInstallDate,
      },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
