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
import { addDays } from "@/lib/contracts/pause-period";

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
  /** Computed next due date (baseline + cycleMonths days). */
  nextDueAt: Date;
  /** Negative = overdue (still recommended within window). */
  daysUntilDue: number;
  /** Cycle length in days that produced this recommendation (field name kept for API compat). */
  cycleMonths: number;
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
  replaceEveryDays: number | null;
  cleanEveryDays: number | null;
  /** PDF A.4 — pre-filters cleaned on every periodic-inspection visit. */
  cleanOnEveryVisit?: boolean;
  /**
   * Admin "최근 교체일" override for this equipment (EquipmentConsumable).
   * When set it is the REPLACE baseline, ahead of the visit-log-derived date —
   * so correcting the last date on the detail page also fixes the tech-app
   * prefill and the customer filter-due reminder. REPLACE only.
   */
  lastReplacedOverride?: Date | null;
  /** Admin "다음 교체 예정일" override — when set it is the REPLACE next-due
   *  directly (wins over baseline+cycle). REPLACE only. */
  nextReplacedOverride?: Date | null;
}

export interface ComputeArgs {
  consumables: ConsumableMeta[];
  logs: ConsumableLogRow[]; // for this equipment only
  installedAt: Date | null;
  visitDate: Date;
  windowDays?: number;
  /**
   * When true, consumables marked `cleanOnEveryVisit` produce a CLEAN
   * recommendation regardless of cycle math. Pass false for ad-hoc visits
   * that aren't periodic inspections.
   */
  isPeriodicInspection?: boolean;
}

/**
 * Pure computation core — split out from the DB query for testability.
 */
export function computeRecommendations(args: ComputeArgs): ConsumableRecommendation[] {
  const {
    consumables,
    logs,
    installedAt,
    visitDate,
    windowDays = 30,
    isPeriodicInspection = true,
  } = args;
  const out: ConsumableRecommendation[] = [];

  const lastByKey = new Map<string, Date>();
  for (const log of logs) {
    const key = `${log.consumableId}:${log.action}`;
    const existing = lastByKey.get(key);
    if (!existing || log.createdAt > existing) lastByKey.set(key, log.createdAt);
  }

  function pushAlwaysClean(c: ConsumableMeta): void {
    const lastDoneAt = lastByKey.get(`${c.id}:CLEAN`) ?? null;
    out.push({
      consumableId: c.id,
      sku: c.sku,
      nameKo: c.nameKo,
      nameVi: c.nameVi,
      nameEn: c.nameEn,
      action: "CLEAN",
      lastDoneAt,
      nextDueAt: visitDate,
      daysUntilDue: 0,
      cycleMonths: 0, // not a real cycle — flagged via cycleMonths=0
    });
  }

  function evaluate(c: ConsumableMeta, action: SuggestAction, cycleDays: number): void {
    const lastDoneAt = lastByKey.get(`${c.id}:${action}`) ?? null;
    // The last-replaced override applies to REPLACE only and wins over the
    // visit-derived date; CLEAN has no admin override.
    const overrideBaseline = action === "REPLACE" ? (c.lastReplacedOverride ?? null) : null;
    const effectiveLast = overrideBaseline ?? lastDoneAt;
    const baseline = effectiveLast ?? installedAt;
    if (!baseline) return;
    // The next-due override (REPLACE only) wins over baseline+cycle.
    const nextOverride = action === "REPLACE" ? (c.nextReplacedOverride ?? null) : null;
    const nextDueAt = nextOverride ?? addDays(baseline, cycleDays);
    const daysUntilDue = daysBetween(visitDate, nextDueAt);
    if (daysUntilDue < -windowDays || daysUntilDue > windowDays) return;
    out.push({
      consumableId: c.id,
      sku: c.sku,
      nameKo: c.nameKo,
      nameVi: c.nameVi,
      nameEn: c.nameEn,
      action,
      lastDoneAt: effectiveLast,
      nextDueAt,
      daysUntilDue,
      cycleMonths: cycleDays,
    });
  }

  for (const c of consumables) {
    // "매 방문 세척" — only relevant on periodic-inspection visits.
    const alwaysClean = c.cleanOnEveryVisit && isPeriodicInspection;
    if (alwaysClean) {
      pushAlwaysClean(c);
    }
    if (c.replaceEveryDays != null) evaluate(c, "REPLACE", c.replaceEveryDays);
    // Skip cycle-based CLEAN when pushAlwaysClean already emitted one for
    // this consumable — otherwise the mobile UI shows two CLEAN rows for
    // the same SKU (one cycle-driven, one every-visit).
    if (!alwaysClean && c.cleanEveryDays != null) evaluate(c, "CLEAN", c.cleanEveryDays);
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
  opts: { windowDays?: number; isPeriodicInspection?: boolean } = {},
): Promise<ConsumableRecommendation[]> {
  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: {
      id: true,
      installedAt: true,
      // Per-equipment overrides (cycle + last-replaced date) keyed by
      // consumableId — applied on top of the catalog defaults below.
      consumables: {
        select: {
          consumableId: true,
          replaceEveryDays: true,
          lastReplacedAtOverride: true,
          nextReplaceAtOverride: true,
        },
      },
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
                  replaceEveryDays: true,
                  cleanEveryDays: true,
                  cleanOnEveryVisit: true,
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

  // External (off-catalog) equipment has no consumables list — return empty.
  if (!equipment.model) return [];

  const overrideByConsumable = new Map(
    equipment.consumables
      .filter((o) => o.consumableId)
      .map((o) => [o.consumableId as string, o]),
  );

  const consumables: ConsumableMeta[] = equipment.model.consumables
    .map((c) => c.consumable)
    .filter((c) => c.isActive)
    .map((c) => {
      const ov = overrideByConsumable.get(c.id);
      return {
        id: c.id,
        sku: c.sku,
        nameKo: c.nameKo,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        // Per-equipment cycle override wins over the catalog cycle (REPLACE).
        replaceEveryDays: ov?.replaceEveryDays ?? c.replaceEveryDays,
        cleanEveryDays: c.cleanEveryDays,
        cleanOnEveryVisit: c.cleanOnEveryVisit,
        lastReplacedOverride: ov?.lastReplacedAtOverride ?? null,
        nextReplacedOverride: ov?.nextReplaceAtOverride ?? null,
      };
    });

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
    isPeriodicInspection: opts.isPeriodicInspection,
  });
}
