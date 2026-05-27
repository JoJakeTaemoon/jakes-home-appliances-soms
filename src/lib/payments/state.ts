/**
 * Payment state machine (PRD §8.4).
 *
 *   EXPECTED          → COLLECTED | RECONCILED | OVERDUE_D7 | WRITTEN_OFF
 *   COLLECTED         → HANDED_OVER | RECONCILED   (small office may skip
 *                                                   the handover step)
 *   HANDED_OVER       → RECONCILED
 *   RECONCILED        → (terminal)
 *   OVERDUE_D7        → COLLECTED | RECONCILED | OVERDUE_D14 | WRITTEN_OFF
 *   OVERDUE_D14       → COLLECTED | RECONCILED | OVERDUE_D30 | WRITTEN_OFF
 *   OVERDUE_D30       → COLLECTED | RECONCILED | WRITTEN_OFF
 *   WRITTEN_OFF       → (terminal)
 *
 * "Late payment" === any non-terminal state advancing back to RECONCILED
 * after the customer settles up.
 *
 * Pure module — returns a planned partial update for Prisma. No DB calls.
 */

export type PaymentState =
  | "EXPECTED"
  | "COLLECTED"
  | "HANDED_OVER"
  | "RECONCILED"
  | "OVERDUE_D7"
  | "OVERDUE_D14"
  | "OVERDUE_D30"
  | "WRITTEN_OFF";

export class IllegalPaymentTransitionError extends Error {
  readonly code = "ILLEGAL_PAYMENT_TRANSITION";
  constructor(from: PaymentState, to: PaymentState) {
    super(`Cannot transition Payment from ${from} to ${to}`);
    this.name = "IllegalPaymentTransitionError";
  }
}

const ALLOWED: Record<PaymentState, ReadonlySet<PaymentState>> = {
  EXPECTED: new Set([
    "COLLECTED",
    "RECONCILED",
    "OVERDUE_D7",
    "WRITTEN_OFF",
  ]),
  COLLECTED: new Set(["HANDED_OVER", "RECONCILED"]),
  HANDED_OVER: new Set(["RECONCILED"]),
  RECONCILED: new Set([]),
  OVERDUE_D7: new Set([
    "COLLECTED",
    "RECONCILED",
    "OVERDUE_D14",
    "WRITTEN_OFF",
  ]),
  OVERDUE_D14: new Set([
    "COLLECTED",
    "RECONCILED",
    "OVERDUE_D30",
    "WRITTEN_OFF",
  ]),
  OVERDUE_D30: new Set(["COLLECTED", "RECONCILED", "WRITTEN_OFF"]),
  WRITTEN_OFF: new Set([]),
};

export function canTransitionPayment(
  from: PaymentState,
  to: PaymentState,
): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export interface PaymentTransitionUpdate {
  state: PaymentState;
  collectedAt?: Date;
  handedOverAt?: Date;
  reconciledAt?: Date;
}

/**
 * Plan the side-effects of a state move. Pure. Stamps the matching timestamp
 * column when the state transitions into a "moment" (collected / handed over /
 * reconciled). Overdue + write-off transitions don't set timestamps — they
 * leave `collectedAt` etc. untouched so a later cure-payment can stamp them.
 */
export function planPaymentTransition(
  from: PaymentState,
  to: PaymentState,
  opts: { now?: Date } = {},
): PaymentTransitionUpdate {
  if (!canTransitionPayment(from, to)) {
    throw new IllegalPaymentTransitionError(from, to);
  }
  const now = opts.now ?? new Date();
  const update: PaymentTransitionUpdate = { state: to };
  if (to === "COLLECTED") update.collectedAt = now;
  if (to === "HANDED_OVER") update.handedOverAt = now;
  if (to === "RECONCILED") update.reconciledAt = now;
  return update;
}

/** Terminal states cannot move further. */
export function isTerminalPaymentState(state: PaymentState): boolean {
  return state === "RECONCILED" || state === "WRITTEN_OFF";
}

/** Helper used by reports + UI badges. */
export function isOverduePaymentState(state: PaymentState): boolean {
  return (
    state === "OVERDUE_D7" ||
    state === "OVERDUE_D14" ||
    state === "OVERDUE_D30"
  );
}

/** Next overdue tier given a day-count past due. Used by the escalation cron. */
export function computeOverdueTier(
  daysPastDue: number,
): "OVERDUE_D7" | "OVERDUE_D14" | "OVERDUE_D30" | null {
  if (daysPastDue >= 30) return "OVERDUE_D30";
  if (daysPastDue >= 14) return "OVERDUE_D14";
  if (daysPastDue >= 7) return "OVERDUE_D7";
  return null;
}
