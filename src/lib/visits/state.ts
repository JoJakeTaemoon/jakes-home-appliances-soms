/**
 * Visit state machine (PRD §8.2).
 *
 *   SUGGESTED       → SCHEDULED | CANCELLED
 *   SCHEDULED       → IN_PROGRESS | RESCHEDULED | CANCELLED | FAILED_NO_SHOW
 *   IN_PROGRESS     → COMPLETED | FAILED_NO_SHOW
 *   RESCHEDULED     → SCHEDULED | CANCELLED
 *   COMPLETED       → (terminal)
 *   CANCELLED       → (terminal)
 *   FAILED_NO_SHOW  → SCHEDULED  (office can re-arm; transitions via /reschedule)
 *
 * Pure function — returns a planned partial update for Prisma. No DB calls.
 */

export type VisitState =
  | "SUGGESTED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED_NO_SHOW"
  | "RESCHEDULED"
  | "CANCELLED";

export class IllegalVisitTransitionError extends Error {
  readonly code = "ILLEGAL_VISIT_TRANSITION";
  constructor(from: VisitState, to: VisitState) {
    super(`Cannot transition Visit from ${from} to ${to}`);
    this.name = "IllegalVisitTransitionError";
  }
}

const ALLOWED: Record<VisitState, ReadonlySet<VisitState>> = {
  SUGGESTED: new Set(["SCHEDULED", "CANCELLED"]),
  SCHEDULED: new Set([
    "IN_PROGRESS",
    "RESCHEDULED",
    "CANCELLED",
    "FAILED_NO_SHOW",
  ]),
  IN_PROGRESS: new Set(["COMPLETED", "FAILED_NO_SHOW"]),
  RESCHEDULED: new Set(["SCHEDULED", "CANCELLED"]),
  COMPLETED: new Set([]),
  CANCELLED: new Set([]),
  FAILED_NO_SHOW: new Set(["SCHEDULED"]),
};

export function canTransitionVisit(from: VisitState, to: VisitState): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export interface VisitTransitionUpdate {
  state: VisitState;
  startedAt?: Date;
  completedAt?: Date;
  failureReason?: string;
}

/** Plan the side-effects of a state move (timestamps, failureReason). Pure. */
export function planVisitTransition(
  from: VisitState,
  to: VisitState,
  opts: { now?: Date; reason?: string | null } = {},
): VisitTransitionUpdate {
  if (!canTransitionVisit(from, to)) {
    throw new IllegalVisitTransitionError(from, to);
  }
  const now = opts.now ?? new Date();
  const update: VisitTransitionUpdate = { state: to };
  if (to === "IN_PROGRESS") update.startedAt = now;
  if (to === "COMPLETED") update.completedAt = now;
  if (to === "FAILED_NO_SHOW" && opts.reason) update.failureReason = opts.reason;
  return update;
}
