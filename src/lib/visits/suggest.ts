/**
 * Periodic-inspection consumable recommender.
 *
 * Given an Equipment + a visit date, find every Consumable compatible with
 * the equipment's model whose next REPLACE or CLEAN cycle falls within a
 * ±30-day window of the visit. A single Consumable carrying both cycles
 * (e.g. RO membrane: clean/6 + replace/24) produces up to TWO recommendations.
 *
 * Baseline rules:
 *   - REPLACE baseline = latest VisitConsumableLog.action=REPLACE on this
 *     equipment for this consumable; else Equipment.installedAt; else null
 *     (skip — we can't compute a due date for never-installed equipment).
 *   - CLEAN baseline = same, but action=CLEAN.
 *
 * Field staff sees these as prefilled checkboxes on the mobile complete
 * screen and can add/remove items at will (`src/app/[locale]/mobile/visits`).
 *
 * Pure functions are exported so unit tests can drive them with synthetic
 * Date math instead of round-tripping through Prisma.
 */

import prisma from "@/lib/prisma";

export type SuggestAction = "REPLACE" | "CLEAN";

export interface ConsumableRecommendation {
  consumableId: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  action: SuggestAction;
  /** Last time this action was performed on this equipment; null if never. */
  lastDoneAt: Date | null;
  /** Computed next due date (baseline + cycleMonths). */
  nextDueAt: Date;
  /** Negative = overdue (still recommended within window). */
  daysUntilDue: number;
  /** Cycle length in months that produced this recommendation. */
  cycleMonths: number;
}

/** Add a whole number of calendar months without crossing month boundaries weirdly. */
export function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  const targetMonth = d.getMonth() + months;
  const originalDay = d.getDate();
  d.setDate(1); // avoid overflow when setting month
  d.setMonth(targetMonth);
  // Clamp to last day of target month if original day exceeded it.
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfMonth));
  return d;
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export interface ConsumableLogRow {
  consumableId: string;
  action: SuggestAction;
  createdAt: Date;
}

export interface ConsumableMeta {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  replaceEveryMonths: number | null;
  cleanEveryMonths: number | null;
}

export interface ComputeArgs {
  consumables: ConsumableMeta[];
  logs: ConsumableLogRow[]; // for this equipment only
  installedAt: Date | null;
  visitDate: Date;
  windowDays?: number;
}

/**
 * Pure computation core — split out from the DB query for testability.
 */
export function computeRecommendations(args: ComputeArgs): ConsumableRecommendation[] {
  const { consumables, logs, installedAt, visitDate, windowDays = 30 } = args;
  const out: ConsumableRecommendation[] = [];

  const lastByKey = new Map<string, Date>();
  for (const log of logs) {
    const key = `${log.consumableId}:${log.action}`;
    const existing = lastByKey.get(key);
    if (!existing || log.createdAt > existing) lastByKey.set(key, log.createdAt);
  }

  function evaluate(c: ConsumableMeta, action: SuggestAction, cycleMonths: number): void {
    const lastDoneAt = lastByKey.get(`${c.id}:${action}`) ?? null;
    const baseline = lastDoneAt ?? installedAt;
    if (!baseline) return;
    const nextDueAt = addMonths(baseline, cycleMonths);
    const daysUntilDue = daysBetween(visitDate, nextDueAt);
    if (daysUntilDue < -windowDays || daysUntilDue > windowDays) return;
    out.push({
      consumableId: c.id,
      sku: c.sku,
      nameKo: c.nameKo,
      nameVi: c.nameVi,
      nameEn: c.nameEn,
      action,
      lastDoneAt,
      nextDueAt,
      daysUntilDue,
      cycleMonths,
    });
  }

  for (const c of consumables) {
    if (c.replaceEveryMonths != null) evaluate(c, "REPLACE", c.replaceEveryMonths);
    if (c.cleanEveryMonths != null) evaluate(c, "CLEAN", c.cleanEveryMonths);
  }

  out.sort((a, b) => a.nextDueAt.getTime() - b.nextDueAt.getTime());
  return out;
}

/**
 * Production entry — fetches the equipment, its model's compatible
 * consumables, and the consumable logs for that equipment, then delegates
 * to `computeRecommendations`.
 */
export async function suggestConsumablesForVisit(
  equipmentId: string,
  visitDate: Date,
  opts: { windowDays?: number } = {},
): Promise<ConsumableRecommendation[]> {
  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: {
      id: true,
      installedAt: true,
      model: {
        select: {
          consumables: {
            select: {
              consumable: {
                select: {
                  id: true,
                  sku: true,
                  nameKo: true,
                  nameVi: true,
                  nameEn: true,
                  replaceEveryMonths: true,
                  cleanEveryMonths: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!equipment) return [];

  const consumables: ConsumableMeta[] = equipment.model.consumables
    .map((c) => c.consumable)
    .filter((c) => c.isActive)
    .map((c) => ({
      id: c.id,
      sku: c.sku,
      nameKo: c.nameKo,
      nameVi: c.nameVi,
      nameEn: c.nameEn,
      replaceEveryMonths: c.replaceEveryMonths,
      cleanEveryMonths: c.cleanEveryMonths,
    }));

  if (consumables.length === 0) return [];

  const logs = await prisma.visitConsumableLog.findMany({
    where: {
      visit: { equipmentId },
      consumableId: { in: consumables.map((c) => c.id) },
    },
    select: { consumableId: true, action: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return computeRecommendations({
    consumables,
    logs: logs.map((l) => ({
      consumableId: l.consumableId,
      action: l.action as SuggestAction,
      createdAt: l.createdAt,
    })),
    installedAt: equipment.installedAt,
    visitDate,
    windowDays: opts.windowDays,
  });
}
