/**
 * Monthly recurring payments cron — first-of-month entry point that wraps
 * `runMonthlyRecurringPayments` from `@/lib/payments/recurring`.
 *
 * Provided as a separate module so the cron script + Vercel Cron config can
 * import from a stable `@/lib/cron/*` namespace.
 */

import {
  runMonthlyRecurringPayments,
  type RecurringRunSummary,
} from "@/lib/payments/recurring";

export async function runRecurringPaymentsCron(
  opts: { now?: Date } = {},
): Promise<RecurringRunSummary> {
  return runMonthlyRecurringPayments(opts);
}

export type { RecurringRunSummary };
