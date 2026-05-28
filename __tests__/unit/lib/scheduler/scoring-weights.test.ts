/**
 * scoreCandidate weight override test (Phase 7 UC-AD-05).
 */
import { describe, it, expect } from "vitest";
import { scoreCandidate, DEFAULT_WEIGHTS } from "@/lib/scheduler/scoring";

describe("scoreCandidate with custom weights", () => {
  it("falls back to DEFAULT_WEIGHTS when none supplied", () => {
    expect(
      scoreCandidate({ isPreferred: true, regionMatch: false, visitsOnDate: 0 }),
    ).toBe(DEFAULT_WEIGHTS.preferred);
  });

  it("respects custom weights", () => {
    const score = scoreCandidate(
      { isPreferred: true, regionMatch: true, visitsOnDate: 2 },
      { preferred: 50, regionMatch: 10, loadPenaltyPerVisit: -3 },
    );
    expect(score).toBe(50 + 10 + -3 * 2);
  });

  it("treats positive loadPenaltyPerVisit as magnitude (negates internally)", () => {
    const score = scoreCandidate(
      { isPreferred: false, regionMatch: false, visitsOnDate: 4 },
      { preferred: 100, regionMatch: 50, loadPenaltyPerVisit: 7 },
    );
    expect(score).toBe(-7 * 4);
  });
});
