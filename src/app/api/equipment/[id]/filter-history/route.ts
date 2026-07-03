/**
 * GET /api/equipment/[id]/filter-history
 *
 * Aggregates every filter (consumable) that's relevant to this
 * equipment + its replacement history + projected next-due date.
 *
 * Sources merged:
 *   1. EquipmentModel.consumables (ConsumableOnModel) — catalog parts
 *   2. EquipmentConsumable rows — per-unit cycle overrides AND manually
 *      added off-catalog filters (customName)
 *
 * For each filter we resolve:
 *   - cycleMonths: EquipmentConsumable.replaceEveryMonths
 *                  ?? Consumable.replaceEveryMonths
 *                  ?? Equipment.customMaintenanceCycle (for external
 *                     devices with no catalog data)
 *   - lastReplacedAt: max VisitConsumableLog.createdAt (action=REPLACE)
 *   - history: every prior VisitConsumableLog (action=REPLACE)
 *   - nextDueAt: lastReplacedAt + cycleMonths (or Equipment.installedAt
 *                + cycleMonths when never replaced yet)
 *   - daysRemaining: floor((nextDueAt - now) / 1day) — negative means overdue
 *   - lastUnitPrice: best-effort Payment.actualAmount tied to the
 *     replacing visit (KIND=SERVICE_FEE), used to seed the "교환금액"
 *     column. The office can fix this later by editing the per-row
 *     unitPrice on EquipmentConsumable.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  const target = d.getMonth() + months;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(target);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot view equipment");
    }
  },
  params: paramsSchema,
  handler: async ({ params }) => {
    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        installedAt: true,
        customMaintenanceCycle: true,
        model: {
          select: {
            consumables: {
              select: {
                quantity: true,
                consumable: {
                  select: {
                    id: true,
                    sku: true,
                    nameKo: true,
                    nameVi: true,
                    nameEn: true,
                    replaceEveryMonths: true,
                    cleanEveryMonths: true,
                    retailPrice: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!equipment) throw new NotFoundError("Equipment not found");

    const overrides = await prisma.equipmentConsumable.findMany({
      where: { equipmentId: params.id },
      include: {
        consumable: {
          select: {
            id: true,
            sku: true,
            nameKo: true,
            nameVi: true,
            nameEn: true,
            replaceEveryMonths: true,
            cleanEveryMonths: true,
            retailPrice: true,
          },
        },
      },
    });

    // Replacement logs for THIS equipment, grouped by consumableId.
    const logs = await prisma.visitConsumableLog.findMany({
      where: {
        visit: { equipmentId: params.id },
        action: "REPLACE",
      },
      select: {
        id: true,
        consumableId: true,
        createdAt: true,
        visit: {
          select: {
            id: true,
            scheduledFor: true,
            payments: {
              where: { kind: "SERVICE_FEE" },
              select: { actualAmount: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const logsByConsumable = new Map<string, typeof logs>();
    for (const l of logs) {
      const list = logsByConsumable.get(l.consumableId) ?? [];
      list.push(l);
      logsByConsumable.set(l.consumableId, list);
    }

    const now = new Date();
    const fallbackCycle = equipment.customMaintenanceCycle ?? null;

    interface FilterRow {
      key: string;
      source: "CATALOG" | "OVERRIDE" | "MANUAL";
      overrideId: string | null;
      consumableId: string | null;
      customName: string | null;
      sku: string | null;
      nameKo: string | null;
      nameVi: string | null;
      nameEn: string | null;
      cycleMonths: number | null;
      cycleSource: "OVERRIDE" | "CATALOG" | "CUSTOM_MAINTENANCE" | "NONE";
      quantity: number;
      lastReplacedAt: string | null;
      nextDueAt: string | null;
      daysRemaining: number | null;
      lastUnitPrice: string | null;
      unitPrice: string | null;
      history: Array<{ id: string; visitId: string; replacedAt: string; cost: string | null }>;
    }

    const out: FilterRow[] = [];
    const seenConsumableIds = new Set<string>();

    // Lookup helpers for per-consumable history.
    function historyFor(consumableId: string): FilterRow["history"] {
      return (logsByConsumable.get(consumableId) ?? []).map((l) => ({
        id: l.id,
        visitId: l.visit.id,
        replacedAt: l.createdAt.toISOString(),
        cost: l.visit.payments[0]?.actualAmount.toString() ?? null,
      }));
    }

    // 1) Override rows first — they author the row's identity when they
    //    point at a catalog consumable (we mark that consumableId seen so
    //    the catalog pass below doesn't double-list it). Manual rows
    //    (customName) are standalone.
    for (const ov of overrides) {
      const c = ov.consumable;
      if (c) seenConsumableIds.add(c.id);
      const cycle =
        ov.replaceEveryMonths ?? c?.replaceEveryMonths ?? fallbackCycle ?? null;
      const cycleSource: FilterRow["cycleSource"] = ov.replaceEveryMonths
        ? "OVERRIDE"
        : c?.replaceEveryMonths
          ? "CATALOG"
          : fallbackCycle
            ? "CUSTOM_MAINTENANCE"
            : "NONE";

      const history = c ? historyFor(c.id) : [];
      const lastReplacedAt = history[0]?.replacedAt ?? null;
      const lastUnitPrice = history[0]?.cost ?? null;
      const baseline = lastReplacedAt
        ? new Date(lastReplacedAt)
        : equipment.installedAt;
      const nextDueAt = cycle && baseline ? addMonths(baseline, cycle) : null;
      const daysRemaining = nextDueAt
        ? Math.floor((nextDueAt.getTime() - now.getTime()) / MS_PER_DAY)
        : null;

      out.push({
        key: ov.id,
        source: c ? "OVERRIDE" : "MANUAL",
        overrideId: ov.id,
        consumableId: c?.id ?? null,
        customName: c ? null : ov.customName,
        sku: c?.sku ?? null,
        nameKo: c?.nameKo ?? null,
        nameVi: c?.nameVi ?? null,
        nameEn: c?.nameEn ?? null,
        cycleMonths: cycle,
        cycleSource,
        quantity: ov.quantity,
        lastReplacedAt,
        nextDueAt: nextDueAt?.toISOString() ?? null,
        daysRemaining,
        lastUnitPrice,
        unitPrice: ov.unitPrice?.toString() ?? null,
        history,
      });
    }

    // 2) Catalog parts that the model says ship with this equipment +
    //    haven't been overridden above.
    const standard = equipment.model?.consumables ?? [];
    for (const entry of standard) {
      const c = entry.consumable;
      if (seenConsumableIds.has(c.id)) continue;
      const cycle = c.replaceEveryMonths ?? fallbackCycle ?? null;
      const cycleSource: FilterRow["cycleSource"] = c.replaceEveryMonths
        ? "CATALOG"
        : fallbackCycle
          ? "CUSTOM_MAINTENANCE"
          : "NONE";

      const history = historyFor(c.id);
      const lastReplacedAt = history[0]?.replacedAt ?? null;
      const lastUnitPrice = history[0]?.cost ?? null;
      const baseline = lastReplacedAt
        ? new Date(lastReplacedAt)
        : equipment.installedAt;
      const nextDueAt = cycle && baseline ? addMonths(baseline, cycle) : null;
      const daysRemaining = nextDueAt
        ? Math.floor((nextDueAt.getTime() - now.getTime()) / MS_PER_DAY)
        : null;

      out.push({
        key: `catalog:${c.id}`,
        source: "CATALOG",
        overrideId: null,
        consumableId: c.id,
        customName: null,
        sku: c.sku,
        nameKo: c.nameKo,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        cycleMonths: cycle,
        cycleSource,
        quantity: entry.quantity,
        lastReplacedAt,
        nextDueAt: nextDueAt?.toISOString() ?? null,
        daysRemaining,
        lastUnitPrice,
        unitPrice: c.retailPrice.toString(),
        history,
      });
    }

    // Sort: soonest due first (nulls last), then by name.
    out.sort((a, b) => {
      const ad = a.daysRemaining ?? Number.POSITIVE_INFINITY;
      const bd = b.daysRemaining ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return (a.nameKo ?? a.customName ?? "").localeCompare(
        b.nameKo ?? b.customName ?? "",
      );
    });

    return { filters: out };
  },
});
