/**
 * Manual trigger for the monthly recurring payments cron (UC-PY-01).
 *
 *   npx tsx scripts/cron-recurring-payments.ts
 *
 * Schedule (Phase 6 — first-of-month VST): `0 0 1 * *`.
 */

import { runRecurringPaymentsCron } from "@/lib/cron/recurring-payments";

async function main() {
  const start = Date.now();
  const summary = await runRecurringPaymentsCron();

  console.log(
    JSON.stringify(
      { ranAt: new Date().toISOString(), elapsedMs: Date.now() - start, ...summary },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {

    console.error("[cron-recurring-payments] failed:", err);
    process.exit(1);
  });
