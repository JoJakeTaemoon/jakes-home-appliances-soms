/**
 * Pure scoring helpers for the visit scheduler.
 *
 * Per CLAUDE.md (C.1 + C.2):
 *   - `Customer.preferredTechnicianId` wins outright if available
 *   - Then `User.preferredRegion === Customer/Site.preferredRegion`
 *   - Then daily-load balance (fewer existing visits today = better)
 *
 * Keeping these as plain functions (no Prisma, no IO) lets the unit tests
 * pin the algorithm in place without spinning a DB.
 */

export const SCORE_PREFERRED = 100;
export const SCORE_REGION_MATCH = 30;
export const SCORE_LOAD_PENALTY_PER_VISIT = -5;

/** Default weights — UC-AD-05 admin can override per-environment. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  preferred: SCORE_PREFERRED,
  regionMatch: SCORE_REGION_MATCH,
  loadPenaltyPerVisit: SCORE_LOAD_PENALTY_PER_VISIT,
};

export interface ScoreWeights {
  preferred: number;
  regionMatch: number;
  /**
   * Negative integer. Per visit-on-date, we subtract this magnitude from the
   * candidate score. (Stored negative for legacy compatibility with
   * SCORE_LOAD_PENALTY_PER_VISIT.)
   */
  loadPenaltyPerVisit: number;
}

export type Rationale = "preferred" | "region_match" | "available";

export interface ScoreInput {
  isPreferred: boolean;
  regionMatch: boolean;
  visitsOnDate: number;
}

/**
 * Compute the score for a single candidate technician. Higher = better.
 * `visitsOnDate` is the number of visits the technician is already scheduled
 * for on the target day; each pulls the score down by 5.
 */
export function scoreCandidate(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  let score = 0;
  if (input.isPreferred) score += weights.preferred;
  if (input.regionMatch) score += weights.regionMatch;
  // loadPenaltyPerVisit is stored as a negative number by convention; if a
  // caller passes a positive value, treat it as a magnitude.
  const penalty =
    weights.loadPenaltyPerVisit <= 0
      ? weights.loadPenaltyPerVisit
      : -weights.loadPenaltyPerVisit;
  score += penalty * Math.max(0, input.visitsOnDate);
  return score;
}

/**
 * Pick the dominant rationale for surfacing in the UI tooltip. Order matters:
 * a preferred match always reads as "preferred" even when region also matches.
 */
export function pickRationale(input: ScoreInput): Rationale {
  if (input.isPreferred) return "preferred";
  if (input.regionMatch) return "region_match";
  return "available";
}
