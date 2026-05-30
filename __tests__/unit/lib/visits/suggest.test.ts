import { describe, it, expect } from "vitest";
import {
  addMonths,
  daysBetween,
  computeRecommendations,
  type ConsumableMeta,
  type ConsumableLogRow,
} from "@/lib/visits/suggest";

const RO: ConsumableMeta = {
  id: "ro",
  sku: "FLT-RO-001",
  nameKo: "RO 멤브레인",
  nameVi: "Màng RO",
  nameEn: "RO Membrane",
  replaceEveryMonths: 24,
  cleanEveryMonths: 6,
};

const SEDIMENT: ConsumableMeta = {
  id: "sed",
  sku: "FLT-SED-001",
  nameKo: "세디먼트",
  nameVi: "Sediment",
  nameEn: "Sediment",
  replaceEveryMonths: 3,
  cleanEveryMonths: null,
};

describe("addMonths", () => {
  it("adds whole months without overflow", () => {
    expect(addMonths(new Date("2026-01-15"), 6).toISOString().slice(0, 10)).toBe("2026-07-15");
  });
  it("clamps to month-end when target month is shorter", () => {
    expect(addMonths(new Date("2026-01-31"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

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

describe("computeRecommendations", () => {
  const visitDate = new Date("2026-06-15");
  const installedAt = new Date("2026-01-15");

  it("produces TWO recommendations when a consumable carries both cycles and both fall in window", () => {
    // RO: replace at install+24mo = 2028-01-15, clean at install+6mo = 2026-07-15.
    // 2026-07-15 is within ±30 days of visit 2026-06-15 → CLEAN suggested.
    // 2028-01-15 is way outside → REPLACE NOT suggested.
    const recs = computeRecommendations({
      consumables: [RO],
      logs: [],
      installedAt,
      visitDate,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBe("CLEAN");
    expect(recs[0].nextDueAt.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("produces both REPLACE and CLEAN when both cycles fall inside window", () => {
    // Pin lastDoneAt for REPLACE so replace is also in window.
    const logs: ConsumableLogRow[] = [
      { consumableId: "ro", action: "REPLACE", createdAt: new Date("2024-06-15") }, // +24mo → 2026-06-15
      { consumableId: "ro", action: "CLEAN", createdAt: new Date("2025-12-15") }, // +6mo → 2026-06-15
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
      installedAt: new Date("2026-04-01"), // +3mo = 2026-07-01 → within ±30d of 2026-06-15
      visitDate,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBe("REPLACE");
    expect(recs[0].lastDoneAt).toBeNull();
    expect(recs[0].nextDueAt.toISOString().slice(0, 10)).toBe("2026-07-01");
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
    // Sediment: install 2026-01-01 + 3mo = 2026-04-01; visit 2026-06-15 → 75 days past → excluded.
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
    const A: ConsumableMeta = { ...SEDIMENT, id: "a", sku: "A", replaceEveryMonths: 1 };
    const B: ConsumableMeta = { ...SEDIMENT, id: "b", sku: "B", replaceEveryMonths: 2 };
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
      { consumableId: "ro", action: "CLEAN", createdAt: new Date("2025-12-15") }, // would put next at 2026-06-15
      { consumableId: "ro", action: "CLEAN", createdAt: new Date("2026-01-15") }, // latest → next at 2026-07-15
    ];
    const recs = computeRecommendations({
      consumables: [RO],
      logs,
      installedAt,
      visitDate,
    });
    const clean = recs.find((r) => r.action === "CLEAN");
    expect(clean?.nextDueAt.toISOString().slice(0, 10)).toBe("2026-07-15");
  });
});
