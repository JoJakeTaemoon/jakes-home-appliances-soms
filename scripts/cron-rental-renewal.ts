/**
 * Manual trigger for the rental renewal reminder cron (UC-NT-08).
 *
 *   npx tsx scripts/cron-rental-renewal.ts
 */

import { runRentalRenewalReminder } from "@/lib/cron/rental-renewal-reminder";

async function main() {
  const start = Date.now();
  const summary = await runRentalRenewalReminder();
  // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.error("[cron-rental-renewal] failed:", err);
    process.exit(1);
  });
