/**
 * Contract state machine (PRD §8.1).
 *
 *   DRAFT             → PENDING_SIGNATURE | CANCELLED
 *   PENDING_SIGNATURE → ACTIVE | CANCELLED
 *   ACTIVE            → AMENDED | COMPLETED | TERMINATED
 *   AMENDED           → ACTIVE
 *   COMPLETED         → (terminal)
 *   TERMINATED        → (terminal)
 *   CANCELLED         → (terminal)
 *
 * `transition(...)` is a pure function — it returns the prepared Prisma
 * update payload (`{ data: { ... } }`) for the caller to write inside a
 * transaction. It does NOT touch the DB. Use it as a typed planner.
 *
 * Side-effect timestamps applied per transition:
 *   - PENDING_SIGNATURE: (none — signatures pending)
 *   - ACTIVE: `activatedAt` (set first time only), `signedByCompanyAt`
 *             (set if missing), `signedByCustomerAt` (set if missing)
 *   - COMPLETED: stays as-is on `activatedAt`; no extra timestamp here
 *     (Equipment.ownership flip happens in the cron-completion helper)
 *   - TERMINATED: `terminatedAt`, `terminationReason`
 *   - CANCELLED: (none)
 *   - AMENDED: (parent contract path — applied by amend helper)
 *
 * Throws `IllegalStateTransitionError` on disallowed paths.
 */

export type ContractState =
  | "DRAFT"
  | "PENDING_SIGNATURE"
  | "ACTIVE"
  | "AMENDED"
  | "COMPLETED"
  | "TERMINATED"
  | "CANCELLED";

export class IllegalStateTransitionError extends Error {
  readonly code = "ILLEGAL_STATE_TRANSITION";
  constructor(from: ContractState, to: ContractState) {
    super(`Cannot transition Contract from ${from} to ${to}`);
    this.name = "IllegalStateTransitionError";
  }
}

const ALLOWED: Record<ContractState, ReadonlySet<ContractState>> = {
  DRAFT: new Set(["PENDING_SIGNATURE", "CANCELLED"]),
  PENDING_SIGNATURE: new Set(["ACTIVE", "CANCELLED"]),
  ACTIVE: new Set(["AMENDED", "COMPLETED", "TERMINATED"]),
  AMENDED: new Set(["ACTIVE"]),
  COMPLETED: new Set([]),
  TERMINATED: new Set([]),
  CANCELLED: new Set([]),
};

export function canTransition(from: ContractState, to: ContractState): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export interface ContractTransitionInput {
  state: ContractState;
  signedByCustomerAt?: Date | null;
  signedByCompanyAt?: Date | null;
  activatedAt?: Date | null;
  terminatedAt?: Date | null;
  terminationReason?: string | null;
}

export interface ContractTransitionUpdate {
  state: ContractState;
  signedByCustomerAt?: Date;
  signedByCompanyAt?: Date;
  activatedAt?: Date;
  terminatedAt?: Date;
  terminationReason?: string | null;
}

export interface TransitionOptions {
  reason?: string | null;
  now?: Date;
}

/**
 * Plan a state transition. Returns the partial-update payload for Prisma.
 * Pure — no DB calls.
 */
export function planTransition(
  current: ContractTransitionInput,
  to: ContractState,
  opts: TransitionOptions = {},
): ContractTransitionUpdate {
  if (!canTransition(current.state, to)) {
    throw new IllegalStateTransitionError(current.state, to);
  }
  const now = opts.now ?? new Date();
  const update: ContractTransitionUpdate = { state: to };

  if (to === "ACTIVE") {
    if (!current.activatedAt) update.activatedAt = now;
    if (!current.signedByCompanyAt) update.signedByCompanyAt = now;
    if (!current.signedByCustomerAt) update.signedByCustomerAt = now;
  } else if (to === "TERMINATED") {
    update.terminatedAt = now;
    update.terminationReason = opts.reason ?? null;
  }
  // AMENDED, COMPLETED, CANCELLED, PENDING_SIGNATURE: no extra timestamps here.

  return update;
}
