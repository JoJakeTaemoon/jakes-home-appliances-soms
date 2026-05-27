/**
 * Service Request state machine (PRD §8.3).
 *
 *   PENDING_REVIEW → APPROVED | REJECTED | CANCELLED
 *   APPROVED       → SCHEDULED | CANCELLED
 *   SCHEDULED      → COMPLETED | CANCELLED
 *   REJECTED       → (terminal)
 *   COMPLETED      → (terminal)
 *   CANCELLED      → (terminal)
 *
 * Pure functions — no DB calls. Returns a partial update planned for Prisma
 * with `decidedAt` stamped on terminal moves out of PENDING_REVIEW.
 */

export type ServiceRequestState =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

export class IllegalSrTransitionError extends Error {
  readonly code = "ILLEGAL_SR_TRANSITION";
  constructor(from: ServiceRequestState, to: ServiceRequestState) {
    super(`Cannot transition ServiceRequest from ${from} to ${to}`);
    this.name = "IllegalSrTransitionError";
  }
}

const ALLOWED: Record<ServiceRequestState, ReadonlySet<ServiceRequestState>> = {
  PENDING_REVIEW: new Set(["APPROVED", "REJECTED", "CANCELLED"]),
  APPROVED: new Set(["SCHEDULED", "CANCELLED", "COMPLETED"]),
  SCHEDULED: new Set(["COMPLETED", "CANCELLED"]),
  REJECTED: new Set([]),
  COMPLETED: new Set([]),
  CANCELLED: new Set([]),
};

export function canTransitionSr(
  from: ServiceRequestState,
  to: ServiceRequestState,
): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export interface SrTransitionUpdate {
  state: ServiceRequestState;
  decidedAt?: Date;
  decidedById?: string | null;
  rejectionReason?: string | null;
}

/**
 * Plan the side-effects of a state move. `decidedAt` is stamped on the first
 * transition out of PENDING_REVIEW; reject reason is attached when targeting
 * REJECTED. Throws `IllegalSrTransitionError` for forbidden moves.
 */
export function planSrTransition(
  from: ServiceRequestState,
  to: ServiceRequestState,
  opts: {
    now?: Date;
    actorUserId?: string | null;
    rejectionReason?: string | null;
  } = {},
): SrTransitionUpdate {
  if (!canTransitionSr(from, to)) {
    throw new IllegalSrTransitionError(from, to);
  }
  const now = opts.now ?? new Date();
  const update: SrTransitionUpdate = { state: to };

  // Stamp decidedAt + decidedById when we first leave PENDING_REVIEW.
  if (from === "PENDING_REVIEW" && to !== "PENDING_REVIEW") {
    update.decidedAt = now;
    if (opts.actorUserId !== undefined) {
      update.decidedById = opts.actorUserId;
    }
  }
  if (to === "REJECTED") {
    update.rejectionReason = opts.rejectionReason ?? null;
  }
  return update;
}
