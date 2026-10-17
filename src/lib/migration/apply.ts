/**
 * Writes a validated migration plan.
 *
 * One transaction for the whole workbook: a migration that half-lands leaves
 * customers without their contracts and equipment without its consumables,
 * and there is no sensible way to resume from that. Either the file is in or
 * it is not.
 *
 * What it deliberately does NOT do:
 *   - send anything. These customers are already being served; a portal
 *     invitation or a visit reminder going out during a data load would be a
 *     visible mistake on the customer's phone. No contact is portal-enabled,
 *     so nothing in the notification path has a reason to fire.
 *   - invent history. Equipment carries its real `installedAt`, so the next
 *     inspection falls due from the true install date.
 *
 * Codes keep their normal allocators — `KH#####` for customers,
 * `HD-…/JH-…` for contracts, `MAY-######` per model for equipment — so
 * imported rows are indistinguishable from ones created in the UI. The
 * customer's own identifiers are preserved in `legacyCode` /
 * `legacyContractNumber`, which is what makes a re-upload skip instead of
 * duplicate.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { allocateCustomerCode } from "@/lib/customers/code";
import { allocateContractCode } from "@/lib/contracts/code";
import { allocateAssetCodes } from "@/lib/equipment/asset-code";
import type { ImportPlan, PlannedEquipment } from "@/lib/migration/plan";

export interface ApplyResult {
  customersCreated: number;
  contractsCreated: number;
  equipmentCreated: number;
  consumablesCreated: number;
  visitsCreated: number;
}

/** `YYYY-MM-DD` as a UTC instant, matching how the rest of the app stores days. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function addMonths(iso: string, months: number): Date {
  const d = day(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export async function applyPlan(
  prisma: PrismaClient,
  plan: ImportPlan,
  actorId: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    customersCreated: 0,
    contractsCreated: 0,
    equipmentCreated: 0,
    consumablesCreated: 0,
    visitsCreated: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      // legacy code (lowercased) → row id, for both newly created rows and
      // ones a previous upload already created.
      const customerIds = new Map<string, { id: string; code: string; type: string; shortcode: string | null }>();
      const contractIds = new Map<string, string>();

      // ── Customers ────────────────────────────────────────────────────
      for (const c of plan.customers) {
        const code = await allocateCustomerCode(tx);
        const customer = await tx.customer.create({
          data: {
            code,
            legacyCode: c.legacyCode,
            name: c.name,
            type: c.type,
            status: "ACTIVE",
            shortcode: c.shortcode,
            taxCode: c.taxCode,
            addressProvinceName: c.provinceName,
            addressWardName: c.wardName,
            addressStreet: c.street,
            contacts: {
              create: {
                role: "CONTRACT_PARTY",
                scope: "CUSTOMER",
                isPrimary: true,
                name: c.contactName,
                phone1: c.contactPhone,
                email: c.contactEmail,
                language: c.language,
                // Left disabled on purpose: enabling the portal here would
                // queue a welcome SMS to every migrated customer at once.
                portalEnabled: false,
              },
            },
          },
          select: { id: true, code: true, type: true, shortcode: true },
        });
        customerIds.set(c.legacyCode.toLowerCase(), customer);
        result.customersCreated += 1;
      }

      /** Resolve a legacy customer code to its row, loading it if a previous
       *  upload created it. */
      const customerFor = async (legacy: string) => {
        const key = legacy.toLowerCase();
        const hit = customerIds.get(key);
        if (hit) return hit;
        const found = await tx.customer.findFirst({
          where: { legacyCode: { equals: legacy, mode: "insensitive" } },
          select: { id: true, code: true, type: true, shortcode: true },
        });
        if (!found) throw new Error(`Customer not found for legacy code ${legacy}`);
        customerIds.set(key, found);
        return found;
      };

      // ── Contracts ────────────────────────────────────────────────────
      for (const k of plan.contracts) {
        const customer = await customerFor(k.customerLegacyCode);
        const contractNumber = allocateContractCode({
          customer: {
            type: customer.type as "B2C" | "B2B",
            code: customer.code,
            shortcode: customer.shortcode,
          },
          type: k.type,
          signedAt: day(k.startDate),
        });
        const contract = await tx.contract.create({
          data: {
            contractNumber,
            legacyContractNumber: k.legacyContractNumber,
            customerId: customer.id,
            type: k.type,
            // These customers are already being served, so the contract is
            // live from the day it started rather than sitting in DRAFT.
            state: "ACTIVE",
            startDate: day(k.startDate),
            endDate:
              k.type === "RENTAL" && k.termMonths
                ? addMonths(k.startDate, k.termMonths)
                : null,
            termMonths: k.type === "RENTAL" ? k.termMonths : null,
            monthlyMaintenanceFee: k.monthlyFee ?? undefined,
            deposit: k.deposit ?? undefined,
            totalContractValue: k.totalValue ?? undefined,
            activatedAt: day(k.startDate),
            notes: k.notes,
          },
          select: { id: true },
        });
        contractIds.set(k.legacyContractNumber.toLowerCase(), contract.id);
        result.contractsCreated += 1;
      }

      const contractFor = async (legacy: string): Promise<string> => {
        const key = legacy.toLowerCase();
        const hit = contractIds.get(key);
        if (hit) return hit;
        const found = await tx.contract.findFirst({
          where: { legacyContractNumber: { equals: legacy, mode: "insensitive" } },
          select: { id: true },
        });
        if (!found) throw new Error(`Contract not found for ${legacy}`);
        contractIds.set(key, found.id);
        return found.id;
      };

      // ── Equipment ────────────────────────────────────────────────────
      // Asset codes run off a per-model sequence, so allocate per model in one
      // call rather than once per row — each call takes the model's advisory
      // lock.
      // Off-catalog units (no model) share one sequence, keyed here by "".
      const byModel = new Map<string, PlannedEquipment[]>();
      for (const e of plan.equipment) {
        const k = e.modelCode.toLowerCase();
        const list = byModel.get(k) ?? [];
        list.push(e);
        byModel.set(k, list);
      }

      const models = await tx.equipmentModel.findMany({
        where: {
          modelCode: {
            in: [...new Set(plan.equipment.map((e) => e.modelCode).filter(Boolean))],
          },
        },
        select: { id: true, modelCode: true },
      });
      const modelByCode = new Map(
        models.map((m) => [(m.modelCode ?? "").toLowerCase(), m]),
      );

      for (const [codeKey, rows] of byModel) {
        const model = codeKey === "" ? null : modelByCode.get(codeKey);
        if (codeKey !== "" && !model) throw new Error(`Model not found: ${codeKey}`);
        const assetCodes = await allocateAssetCodes(tx, model?.id ?? null, rows.length);

        for (const [i, e] of rows.entries()) {
          const customer = await customerFor(e.customerLegacyCode);
          const equipment = await tx.equipment.create({
            data: {
              customerId: customer.id,
              modelId: model?.id ?? null,
              customDescription: model ? null : e.customDescription,
              assetCode: assetCodes[i],
              serialNumber: e.serial,
              status: "ACTIVE",
              // A rental unit is mid-term; anything else is being serviced
              // rather than awaiting its installation visit.
              lifecycleStage: e.serviceType === "RENTAL" ? "IN_RENTAL" : "IN_MAINTENANCE",
              ownership: e.serviceType === "SALE" ? "CUSTOMER" : "COMPANY",
              installedAt: day(e.installedDate),
              serviceType: e.serviceType,
              managementType: e.managementType,
              monthlyFee: e.monthlyFee ?? undefined,
              customInspectionCycleDays: e.inspectionCycleDays ?? undefined,
              notes: e.notes,
            },
            select: { id: true },
          });
          result.equipmentCreated += 1;

          if (e.contractLegacyNumber) {
            await tx.contractEquipment.create({
              data: {
                contractId: await contractFor(e.contractLegacyNumber),
                equipmentId: equipment.id,
                quantity: 1,
                unitPrice: e.monthlyFee ?? undefined,
              },
            });
          }

          for (const c of e.consumables) {
            const consumableId = c.sku
              ? (
                  await tx.consumable.findFirst({
                    where: { sku: { equals: c.sku, mode: "insensitive" } },
                    select: { id: true },
                  })
                )?.id ?? null
              : null;
            await tx.equipmentConsumable.create({
              data: {
                equipmentId: equipment.id,
                consumableId,
                customName: consumableId ? null : c.customName,
                quantity: c.quantity,
                replaceEveryDays: c.replaceEveryDays ?? undefined,
                lastReplacedAtOverride: c.lastReplacedDate
                  ? day(c.lastReplacedDate)
                  : undefined,
                notes: c.notes,
              },
            });
            result.consumablesCreated += 1;
          }

          // A completed installation visit dated to the real install day, so
          // the equipment history does not start blank.
          await tx.visit.create({
            data: {
              customerId: customer.id,
              equipmentId: equipment.id,
              type: "INSTALLATION",
              state: "COMPLETED",
              scheduledFor: day(e.installedDate),
              completedAt: day(e.installedDate),
              officeNotes: "Migrated from the previous system",
            },
          });
          result.visitsCreated += 1;
        }
      }
    },
    // A migration workbook is thousands of rows; the default 5s budget is for
    // request-sized work, not this.
    { timeout: 300_000, maxWait: 30_000 },
  );

  await logAudit({
    actorType: "USER",
    actorId,
    action: "MIGRATION_IMPORTED",
    entityType: "Customer",
    entityId: null,
    after: result as unknown as Record<string, unknown>,
  });

  return result;
}
