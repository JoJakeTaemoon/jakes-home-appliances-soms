import { describe, it, expect } from "vitest";
import {
  daysBetween,
  computeRecommendations,
  type ConsumableMeta,
  type ConsumableLogRow,
} from "@/lib/visits/suggest";
import { addDays } from "@/lib/contracts/pause-period";

// replaceEveryDays/cleanEveryDays are DAY counts (post ×30 migration — see
// Task 0.6a). RO: clean every 180 days (~6mo), replace every 720 days (~24mo).
const RO: ConsumableMeta = {
  id: "ro",
  sku: "FLT-RO-001",
  nameKo: "RO 멤브레인",
  nameVi: "Màng RO",
  nameEn: "RO Membrane",
  replaceEveryDays: 720,
  cleanEveryDays: 180,
};

const SEDIMENT: ConsumableMeta = {
  id: "sed",
  sku: "FLT-SED-001",
  nameKo: "세디먼트",
  nameVi: "Sediment",
  nameEn: "Sediment",
  replaceEveryDays: 90,
  cleanEveryDays: null,
};

describe("daysBetween", () => {
  it("returns 0 for same day", () => {
    expect(daysBetween(new Date("2026-05-30"), new Date("2026-05-30"))).toBe(0);
  });
  it("returns positive for future", () => {
    expect(daysBetween(new Date("2026-05-30"), new Date("2026-06-09"))).toBe(10);
  });
  it("returns negative for past", () => {
    expect(daysBetween(new Date("2026-05-30"), new Date("2026-05-20"))).toBe(-10);
  });
});

describe("computeRecommendations — lastReplacedOverride (WS1)", () => {
  it("uses the admin override as the REPLACE baseline, ahead of logs + install date", () => {
    // Log would put next-due far in the past (out of window → not shown).
    // The override re-anchors it to within the window so it surfaces.
    const meta: ConsumableMeta = {
      ...SEDIMENT, // replaceEveryDays: 90
      lastReplacedOverride: new Date("2026-05-01"),
    };
    const out = computeRecommendations({
      consumables: [meta],
      logs: [{ consumableId: "sed", action: "REPLACE", createdAt: new Date("2026-01-01") }],
      installedAt: new Date("2025-01-01"),
      visitDate: new Date("2026-07-20"),
      windowDays: 30,
    });
    const rep = out.find((r) => r.action === "REPLACE" && r.consumableId === "sed");
    expect(rep).toBeTruthy();
    expect(rep!.lastDoneAt).toEqual(new Date("2026-05-01"));
    expect(rep!.nextDueAt).toEqual(addDays(new Date("2026-05-01"), 90));
  });

  it("does not apply the override to CLEAN actions", () => {
    const meta: ConsumableMeta = {
      ...RO, // cleanEveryDays: 180
      lastReplacedOverride: new Date("2026-06-10"),
    };
    const out = computeRecommendations({
      consumables: [meta],
      logs: [{ consumableId: "ro", action: "CLEAN", createdAt: new Date("2026-01-10") }],
      installedAt: new Date("2025-01-01"),
      visitDate: new Date("2026-07-15"),
      windowDays: 30,
    });
    const clean = out.find((r) => r.action === "CLEAN" && r.consumableId === "ro");
    // CLEAN baseline stays the log date (2026-01-10), not the REPLACE override.
    expect(clean?.lastDoneAt).toEqual(new Date("2026-01-10"));
  });
});

describe("computeRecommendations", () => {
  const visitDate = new Date("2026-06-15");
  const installedAt = new Date("2026-01-15");

  it("always adds CLEAN for cleanOnEveryVisit consumables on periodic inspections", () => {
    const PRE: ConsumableMeta = {
      ...SEDIMENT,
      id: "pre",
      sku: "PRE",
      replaceEveryDays: null,
      cleanOnEveryVisit: true,
    };
    const recs = computeRecommendations({
      consumables: [PRE],
      logs: [],
      installedAt: null, // even with no install date
      visitDate,
      isPeriodicInspection: true,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBe("CLEAN");
    expect(recs[0].nextDueAt.toISOString()).toBe(visitDate.toISOString());
    // pushAlwaysClean sentinel invariants — downstream UI uses these to
    // distinguish "every-visit clean" from a cycle-driven CLEAN:
    expect(recs[0].daysUntilDue).toBe(0);
    expect(recs[0].cycleMonths).toBe(0);
    // No prior log → lastDoneAt is null (NOT installedAt, NOT visitDate)
    expect(recs[0].lastDoneAt).toBeNull();
  });

  it("cleanOnEveryVisit picks lastDoneAt from prior CLEAN log when present", () => {
    const lastClean = new Date("2026-05-15");
    const PRE: ConsumableMeta = {
      ...SEDIMENT,
      id: "pre",
      sku: "PRE",
      replaceEveryDays: null,
      cleanOnEveryVisit: true,
    };
    const recs = computeRecommendations({
      consumables: [PRE],
      logs: [{ consumableId: "pre", action: "CLEAN", createdAt: lastClean }],
      installedAt: null,
      visitDate,
      isPeriodicInspection: true,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].lastDoneAt?.toISOString()).toBe(lastClean.toISOString());
  });

  it("skips cleanOnEveryVisit when not a periodic inspection", () => {
    const PRE: ConsumableMeta = {
      ...SEDIMENT,
      id: "pre",
      sku: "PRE",
      replaceEveryDays: null,
      cleanOnEveryVisit: true,
    };
    const recs = computeRecommendations({
      consumables: [PRE],
      logs: [],
      installedAt: null,
      visitDate,
      isPeriodicInspection: false,
    });
    expect(recs).toEqual([]);
  });

  it("produces TWO recommendations when a consumable carries both cycles and both fall in window", () => {
    // RO: replace at install+720d = 2028-01-05, clean at install+180d = 2026-07-14.
    // 2026-07-14 is within ±30 days of visit 2026-06-15 → CLEAN suggested.
    // 2028-01-05 is way outside → REPLACE NOT suggested.
    const recs = computeRecommendations({
      consumables: [RO],
      logs: [],
      installedAt,
      visitDate,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBe("CLEAN");
    expect(recs[0].nextDueAt.toISOString().slice(0, 10)).toBe("2026-07-14");
  });

  it("produces both REPLACE and CLEAN when both cycles fall inside window", () => {
    // Pin lastDoneAt for REPLACE so replace is also in window.
    const logs: ConsumableLogRow[] = [
      { consumableId: "ro", action: "REPLACE", createdAt: new Date("2024-06-15") }, // +720d → 2026-06-05
      { consumableId: "ro", action: "CLEAN", createdAt: new Date("2025-12-15") }, // +180d → 2026-06-13
    ];
    const recs = computeRecommendations({
      consumables: [RO],
      logs,
      installedAt,
      visitDate,
    });
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.action).sort()).toEqual(["CLEAN", "REPLACE"]);
  });

  it("uses installedAt as baseline when no logs exist", () => {
    const recs = computeRecommendations({
      consumables: [SEDIMENT],
      logs: [],
      installedAt: new Date("2026-04-01"), // +90d = 2026-06-30 → within ±30d of 2026-06-15
      visitDate,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBe("REPLACE");
    expect(recs[0].lastDoneAt).toBeNull();
    expect(recs[0].nextDueAt.toISOString().slice(0, 10)).toBe("2026-06-30");
  });

  it("skips consumable when no log AND no installedAt", () => {
    const recs = computeRecommendations({
      consumables: [SEDIMENT],
      logs: [],
      installedAt: null,
      visitDate,
    });
    expect(recs).toEqual([]);
  });

  it("excludes recommendations outside ±30 day window", () => {
    // Sediment: install 2026-01-01 + 90d = 2026-04-01; visit 2026-06-15 → 75 days past → excluded.
    const recs = computeRecommendations({
      consumables: [SEDIMENT],
      logs: [],
      installedAt: new Date("2026-01-01"),
      visitDate,
    });
    expect(recs).toEqual([]);
  });

  it("respects windowDays option (e.g. extend to 60 picks up further-out items)", () => {
    // Same Sediment as above (75 days past); with windowDays=90 it's in window.
    const recs = computeRecommendations({
      consumables: [SEDIMENT],
      logs: [],
      installedAt: new Date("2026-01-01"),
      visitDate,
      windowDays: 90,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].daysUntilDue).toBeLessThan(0); // overdue
  });

  it("sorts recommendations by nextDueAt ascending", () => {
    const A: ConsumableMeta = { ...SEDIMENT, id: "a", sku: "A", replaceEveryDays: 1 };
    const B: ConsumableMeta = { ...SEDIMENT, id: "b", sku: "B", replaceEveryDays: 2 };
    const recs = computeRecommendations({
      consumables: [B, A],
      logs: [],
      installedAt: new Date("2026-05-20"),
      visitDate,
      windowDays: 60, // widen so both 2026-06-20 and 2026-07-20 fall inside
    });
    expect(recs.map((r) => r.consumableId)).toEqual(["a", "b"]);
  });

  it("picks the latest log per (consumable, action)", () => {
    const logs: ConsumableLogRow[] = [
      { consumableId: "ro", action: "CLEAN", createdAt: new Date("2025-12-15") }, // would put next at 2026-06-13
      { consumableId: "ro", action: "CLEAN", createdAt: new Date("2026-01-15") }, // latest → next at 2026-07-14
    ];
    const recs = computeRecommendations({
      consumables: [RO],
      logs,
      installedAt,
      visitDate,
    });
    const clean = recs.find((r) => r.action === "CLEAN");
    expect(clean?.nextDueAt.toISOString().slice(0, 10)).toBe("2026-07-14");
  });
});
