/**
 * Visit-document issuance gate (Track 3 / D3 policy).
 *
 * Decided 2026-06-03: visit documents are issuable only after a
 * technician has been assigned to a visit — the technician carries the
 * printed papers to the customer, so SUGGESTED (unassigned) visits
 * cannot have documents. COMPLETED/IN_PROGRESS visits can still be
 * re-issued (an office user may need to reprint a lost copy).
 */

export type VisitStateForPolicy =
  | "SUGGESTED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED_NO_SHOW"
  | "RESCHEDULED"
  | "CANCELLED";

export interface IssuanceCheckInput {
  state: VisitStateForPolicy;
  leadTechnicianId: string | null;
}

export type IssuanceBlockReason =
  | "VISIT_UNASSIGNED"
  | "VISIT_CANCELLED"
  | "VISIT_FAILED";

export interface IssuanceCheckResult {
  allowed: boolean;
  reason: IssuanceBlockReason | null;
}

const ALLOWED_STATES: ReadonlySet<VisitStateForPolicy> = new Set([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "RESCHEDULED",
]);

export function canIssueVisitDocument(
  input: IssuanceCheckInput,
): IssuanceCheckResult {
  if (input.state === "CANCELLED") {
    return { allowed: false, reason: "VISIT_CANCELLED" };
  }
  if (input.state === "FAILED_NO_SHOW") {
    return { allowed: false, reason: "VISIT_FAILED" };
  }
  if (!ALLOWED_STATES.has(input.state)) {
    // SUGGESTED — visit not confirmed yet.
    return { allowed: false, reason: "VISIT_UNASSIGNED" };
  }
  if (!input.leadTechnicianId) {
    return { allowed: false, reason: "VISIT_UNASSIGNED" };
  }
  return { allowed: true, reason: null };
}
