import { describe, it, expect } from "vitest";
import {
  scoreCandidate,
  pickRationale,
  SCORE_PREFERRED,
  SCORE_REGION_MATCH,
  SCORE_LOAD_PENALTY_PER_VISIT,
} from "@/lib/scheduler/scoring";

describe("scoreCandidate", () => {
  it("returns 0 for a generic available technician with no load", () => {
    expect(
      scoreCandidate({
        isPreferred: false,
        regionMatch: false,
        visitsOnDate: 0,
      }),
    ).toBe(0);
  });

  it("applies the preferred-tech bonus", () => {
    expect(
      scoreCandidate({
        isPreferred: true,
        regionMatch: false,
        visitsOnDate: 0,
      }),
    ).toBe(SCORE_PREFERRED);
  });

  it("applies the region-match bonus", () => {
    expect(
      scoreCandidate({
        isPreferred: false,
        regionMatch: true,
        visitsOnDate: 0,
      }),
    ).toBe(SCORE_REGION_MATCH);
  });

  it("stacks preferred + region match bonuses", () => {
    expect(
      scoreCandidate({
        isPreferred: true,
        regionMatch: true,
        visitsOnDate: 0,
      }),
    ).toBe(SCORE_PREFERRED + SCORE_REGION_MATCH);
  });

  it("subtracts 5 per existing visit on the date", () => {
    expect(
      scoreCandidate({
        isPreferred: false,
        regionMatch: true,
        visitsOnDate: 3,
      }),
    ).toBe(SCORE_REGION_MATCH + 3 * SCORE_LOAD_PENALTY_PER_VISIT);
  });

  it("preferred tech still beats heavy region-match-only candidate", () => {
    const preferredHeavyLoad = scoreCandidate({
      isPreferred: true,
      regionMatch: false,
      visitsOnDate: 5,
    });
    const regionLight = scoreCandidate({
      isPreferred: false,
      regionMatch: true,
      visitsOnDate: 0,
    });
    expect(preferredHeavyLoad).toBeGreaterThan(regionLight);
  });
});

describe("pickRationale", () => {
  it("calls preferred when preferred even if region also matches", () => {
    expect(
      pickRationale({
        isPreferred: true,
        regionMatch: true,
        visitsOnDate: 0,
      }),
    ).toBe("preferred");
  });
  it("calls region_match when only region matches", () => {
    expect(
      pickRationale({
        isPreferred: false,
        regionMatch: true,
        visitsOnDate: 1,
      }),
    ).toBe("region_match");
  });
  it("calls available when neither bonus applies", () => {
    expect(
      pickRationale({
        isPreferred: false,
        regionMatch: false,
        visitsOnDate: 2,
      }),
    ).toBe("available");
  });
});
