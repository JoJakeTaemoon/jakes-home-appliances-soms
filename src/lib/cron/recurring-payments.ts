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
import type { JobSummary, ScheduledJob } from "@/lib/cron/job";

export async function runRecurringPaymentsCron(
  opts: { now?: Date } = {},
): Promise<RecurringRunSummary> {
  return runMonthlyRecurringPayments(opts);
}

export type { RecurringRunSummary };

/**
 * `ScheduledJob` adapter — canonical export for
 * `/api/cron/recurring-payments/route.ts`. Wraps the payments-module runner
 * so cron orchestration stays uniform across the suite.
 */
export const recurringPaymentsJob: ScheduledJob = {
  name: "recurring-payments",
  async run({ now }): Promise<JobSummary> {
    const r = await runRecurringPaymentsCron({ now });
    return {
      jobName: "recurring-payments",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      itemsProcessed: r.paymentsCreated,
      itemsSkipped: r.skippedExisting + r.skippedNoFee,
      itemsFailed: 0,
      contractsScanned: r.contractsScanned,
      paymentsCreated: r.paymentsCreated,
      skippedExisting: r.skippedExisting,
      skippedNoFee: r.skippedNoFee,
    };
  },
};
