/**
 * GET /api/equipment/[id]/service-config
 *
 * Unified service configuration table for the equipment-detail master-detail
 * panel. Returns:
 *   - a single inspection row (kind=INSPECTION) with cycle / last / next
 *   - one row per filter (kind=FILTER), reusing the filter-history shape
 *     so the UI can render both in one table
 *
 * Status calculation (used to drive the colored chip):
 *   - daysRemaining < 0           → OVERDUE (red)
 *   - daysRemaining 0..7          → REPLACE_DUE (orange)
 *   - daysRemaining 8..30         → SCHEDULED (blue)
 *   - daysRemaining > 30          → NORMAL (green)
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { addDays } from "@/lib/contracts/pause-period";

const paramsSchema = z.object({ id: z.string() });

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function statusFor(days: number | null): "NORMAL" | "SCHEDULED" | "REPLACE_DUE" | "OVERDUE" | "UNKNOWN" {
  if (days === null) return "UNKNOWN";
  if (days < 0) return "OVERDUE";
  if (days <= 7) return "REPLACE_DUE";
  if (days <= 30) return "SCHEDULED";
  return "NORMAL";
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
        customInspectionCycleDays: true,
        customMaintenanceCycleDays: true,
        model: {
          select: {
            inspectionEveryDays: true,
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
                    replaceEveryDays: true,
                    retailPrice: true,
                  },
                },
              },
            },
          },
        },
        consumables: {
          select: {
            id: true,
            consumableId: true,
            customName: true,
            quantity: true,
            replaceEveryDays: true,
            unitPrice: true,
            consumable: {
              select: {
                id: true,
                sku: true,
                nameKo: true,
                nameVi: true,
                nameEn: true,
                replaceEveryDays: true,
                retailPrice: true,
              },
            },
          },
        },
      },
    });
    if (!equipment) throw new NotFoundError("Equipment not found");

    // ─── INSPECTION row ────────────────────────────────────────────────
    const inspectionCycleDefault = equipment.model?.inspectionEveryDays ?? null;
    const inspectionCycleOverride = equipment.customInspectionCycleDays ?? null;
    const effectiveInspectionCycle = inspectionCycleOverride ?? inspectionCycleDefault;
    // Latest completed PERIODIC_INSPECTION visit for this equipment.
    const lastInspection = await prisma.visit.findFirst({
      where: {
        equipmentId: equipment.id,
        type: "PERIODIC_INSPECTION",
        completedAt: { not: null },
      },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
    });
    // 2nd-latest for "과거 수행일" column.
    const prevInspection = await prisma.visit.findFirst({
      where: {
        equipmentId: equipment.id,
        type: "PERIODIC_INSPECTION",
        completedAt: { not: null },
      },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
      skip: 1,
    });
    const inspectionAnchor = lastInspection?.completedAt ?? equipment.installedAt;
    const inspectionNext =
      effectiveInspectionCycle && inspectionAnchor
        ? addDays(inspectionAnchor, effectiveInspectionCycle)
        : null;
    const inspectionDays = inspectionNext
      ? Math.ceil((inspectionNext.getTime() - Date.now()) / MS_PER_DAY)
      : null;

    const inspectionRow = {
      kind: "INSPECTION" as const,
      key: "inspection",
      name: "정기 점검",
      defaultCycleMonths: inspectionCycleDefault,
      userCycleMonths: inspectionCycleOverride,
      effectiveCycleMonths: effectiveInspectionCycle,
      quantity: 1,
      previousAt: prevInspection?.completedAt ?? null,
      lastAt: lastInspection?.completedAt ?? null,
      nextDueAt: inspectionNext,
      daysRemaining: inspectionDays,
      lastUnitPrice: null,
      status: statusFor(inspectionDays),
    };

    // ─── FILTER rows ────────────────────────────────────────────────────
    // Resolve per-filter map: catalog rows + override + manual.
    type FilterRow = {
      kind: "FILTER";
      key: string;
      sourceKind: "CATALOG" | "OVERRIDE" | "MANUAL";
      overrideId: string | null;
      consumableId: string | null;
      name: { ko: string | null; vi: string | null; en: string | null };
      sku: string | null;
      defaultCycleMonths: number | null;
      userCycleMonths: number | null;
      effectiveCycleMonths: number | null;
      quantity: number;
      previousAt: Date | null;
      lastAt: Date | null;
      nextDueAt: Date | null;
      daysRemaining: number | null;
      lastUnitPrice: number | null;
      status: ReturnType<typeof statusFor>;
    };

    const catalogRows = equipment.model?.consumables ?? [];
    const overrideRows = equipment.consumables;

    // Build a map keyed by consumableId — catalog entries become base rows;
    // overrides on the same consumableId replace cycle/unitPrice; manual
    // (customName / consumableId not in catalog) become extra rows.
    const overrideByConsumable = new Map<string, (typeof overrideRows)[number]>();
    const manualRows: typeof overrideRows = [];
    for (const ov of overrideRows) {
      if (ov.consumableId) {
        const catalogHas = catalogRows.some(
          (c) => c.consumable?.id === ov.consumableId,
        );
        if (catalogHas) {
          overrideByConsumable.set(ov.consumableId, ov);
        } else {
          manualRows.push(ov);
        }
      } else {
        manualRows.push(ov);
      }
    }

    const filterRows: FilterRow[] = [];

    for (const c of catalogRows) {
      if (!c.consumable) continue;
      const ov = overrideByConsumable.get(c.consumable.id);
      const defaultCycle = c.consumable.replaceEveryDays ?? null;
      const userCycle = ov?.replaceEveryDays ?? null;
      const effective = userCycle ?? defaultCycle;
      filterRows.push({
        kind: "FILTER",
        key: `cat-${c.consumable.id}`,
        sourceKind: ov ? "OVERRIDE" : "CATALOG",
        overrideId: ov?.id ?? null,
        consumableId: c.consumable.id,
        name: { ko: c.consumable.nameKo, vi: c.consumable.nameVi, en: c.consumable.nameEn },
        sku: c.consumable.sku,
        defaultCycleMonths: defaultCycle,
        userCycleMonths: userCycle,
        effectiveCycleMonths: effective,
        quantity: ov?.quantity ?? c.quantity,
        previousAt: null,
        lastAt: null,
        nextDueAt: null,
        daysRemaining: null,
        lastUnitPrice: ov?.unitPrice ? Number(ov.unitPrice) : c.consumable.retailPrice ? Number(c.consumable.retailPrice) : null,
        status: "UNKNOWN",
      });
    }

    for (const m of manualRows) {
      const defaultCycle = m.consumable?.replaceEveryDays ?? null;
      const userCycle = m.replaceEveryDays ?? null;
      const effective = userCycle ?? defaultCycle;
      filterRows.push({
        kind: "FILTER",
        key: `man-${m.id}`,
        sourceKind: "MANUAL",
        overrideId: m.id,
        consumableId: m.consumableId,
        name: m.consumable
          ? { ko: m.consumable.nameKo, vi: m.consumable.nameVi, en: m.consumable.nameEn }
          : { ko: m.customName, vi: m.customName, en: m.customName },
        sku: m.consumable?.sku ?? null,
        defaultCycleMonths: defaultCycle,
        userCycleMonths: userCycle,
        effectiveCycleMonths: effective,
        quantity: m.quantity,
        previousAt: null,
        lastAt: null,
        nextDueAt: null,
        daysRemaining: null,
        lastUnitPrice: m.unitPrice
          ? Number(m.unitPrice)
          : m.consumable?.retailPrice
            ? Number(m.consumable.retailPrice)
            : null,
        status: "UNKNOWN",
      });
    }

    // Pull replacement history for all involved consumableIds in one query.
    const involvedConsumableIds = Array.from(
      new Set(
        filterRows
          .map((r) => r.consumableId)
          .filter((v): v is string => typeof v === "string"),
      ),
    );
    const logs =
      involvedConsumableIds.length === 0
        ? []
        : await prisma.visitConsumableLog.findMany({
            where: {
              consumableId: { in: involvedConsumableIds },
              action: "REPLACE",
              visit: { equipmentId: equipment.id },
            },
            select: {
              consumableId: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          });

    const logsByConsumable = new Map<string, typeof logs>();
    for (const l of logs) {
      const arr = logsByConsumable.get(l.consumableId) ?? [];
      arr.push(l);
      logsByConsumable.set(l.consumableId, arr);
    }

    for (const row of filterRows) {
      if (!row.consumableId) continue;
      const arr = logsByConsumable.get(row.consumableId) ?? [];
      row.lastAt = arr[0]?.createdAt ?? null;
      row.previousAt = arr[1]?.createdAt ?? null;
      const anchor = row.lastAt ?? equipment.installedAt;
      if (anchor && row.effectiveCycleMonths) {
        row.nextDueAt = addDays(anchor, row.effectiveCycleMonths);
        row.daysRemaining = Math.ceil(
          (row.nextDueAt.getTime() - Date.now()) / MS_PER_DAY,
        );
        row.status = statusFor(row.daysRemaining);
      }
    }

    return { rows: [inspectionRow, ...filterRows] };
  },
});
