import { describe, it, expect } from "vitest";
import { addDays } from "@/lib/contracts/pause-period";
import { computeRecommendations, type ConsumableMeta } from "@/lib/visits/suggest";

describe("cycle due-date is day-based", () => {
  it("365-day cycle adds 365 days, not 365 months (util-level pin)", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const due = addDays(base, 365);
    expect(due.toISOString().slice(0, 10)).toBe("2027-01-01"); // if month math leaks back in, this jumps to ~2056
  });

  it("suggest.ts computeRecommendations uses day math for a 365-day cycle", () => {
    // replaceEveryDays is a DAY count (post ×30 migration). A consumable
    // installed 2026-01-01 with a 365-day cycle is due exactly 2027-01-01.
    // Under the old addMonths(base, 365) bug this lands ~2056 — 365 MONTHS
    // out — so it would fall miles outside the ±30-day window and never
    // be recommended.
    const FILTER: ConsumableMeta = {
      id: "f1",
      sku: "FLT-365",
      nameKo: "필터",
      nameVi: "Lõi lọc",
      nameEn: "Filter",
      replaceEveryDays: 365,
      cleanEveryDays: null,
    };
    const recs = computeRecommendations({
      consumables: [FILTER],
      logs: [],
      installedAt: new Date("2026-01-01T00:00:00Z"),
      visitDate: new Date("2027-01-01T00:00:00Z"),
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].nextDueAt.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(recs[0].daysUntilDue).toBe(0);
  });
});
