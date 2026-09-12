/**
 * Per-equipment pause-period accounting (added 2026-06).
 *
 * Policy (final word from product 2026-06-22):
 *   - The Contract document is immutable. endDate, totalContractValue,
 *     monthlyMaintenanceFee, termMonths are NOT rewritten when an
 *     equipment is paused.
 *   - DEACTIVATING an equipment freezes that line's rental + maintenance
 *     billing pro-rata. REACTIVATING resumes billing.
 *   - Each ContractEquipment line carries its own pause ledger
 *     (cumulativePausedDays + currentPauseStartedAt). The line's
 *     effective settlement date (retrieval / ownership transfer) =
 *     contract.endDate + cumulativePausedDays. Sibling lines under the
 *     same contract settle on independent dates.
 *
 * This module is the single source of truth for those calculations so
 * the API, cron, UI, and billing layer never disagree about how a
 * pause ledger turns into a billable day count or a settlement date.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PauseLedger {
  cumulativePausedDays: number;
  currentPauseStartedAt: Date | null;
}

/** Full days between two dates (floor). */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Add whole days to an instant, in UTC.
 *
 * Every date this touches is a domain due-date persisted as a UTC instant
 * (contract end, filter next-due, inspection next-due). The local-time
 * `setDate()` this used to call shifted the resulting calendar day by one on
 * any machine west of UTC, so a developer in New York and the server in
 * Vietnam computed different due dates from the same row. Vietnam has no DST,
 * so UTC day arithmetic and VST day arithmetic agree by construction.
 */
export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Total paused days for a line as of `now`. Includes the in-progress
 * pause window when one is open.
 */
export function pausedDaysAsOf(ledger: PauseLedger, now: Date): number {
  let total = ledger.cumulativePausedDays;
  if (ledger.currentPauseStartedAt) {
    total += Math.max(0, daysBetween(ledger.currentPauseStartedAt, now));
  }
  return total;
}

/**
 * Effective per-equipment settlement date.
 *   = contract.endDate + cumulativePausedDays (+ any in-flight pause).
 *
 * Returns null when the contract has no endDate (open-ended MAINTENANCE).
 * For MAINTENANCE contracts settlement is driven manually.
 */
export function effectiveEndDate(
  contractEndDate: Date | null,
  ledger: PauseLedger,
  now: Date,
): Date | null {
  if (!contractEndDate) return null;
  return addDays(contractEndDate, pausedDaysAsOf(ledger, now));
}

/**
 * Opening a pause window. Idempotent: if a window is already open, do
 * nothing — the caller has already paused the line.
 */
export function openPause(
  ledger: PauseLedger,
  at: Date,
): PauseLedger {
  if (ledger.currentPauseStartedAt) return ledger;
  return {
    cumulativePausedDays: ledger.cumulativePausedDays,
    currentPauseStartedAt: at,
  };
}

/**
 * Closing a pause window. Rolls the elapsed days into the cumulative
 * counter. Idempotent: if no window is open, do nothing.
 */
export function closePause(
  ledger: PauseLedger,
  at: Date,
): PauseLedger {
  if (!ledger.currentPauseStartedAt) return ledger;
  const elapsed = Math.max(0, daysBetween(ledger.currentPauseStartedAt, at));
  return {
    cumulativePausedDays: ledger.cumulativePausedDays + elapsed,
    currentPauseStartedAt: null,
  };
}
