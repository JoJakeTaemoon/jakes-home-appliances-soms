/**
 * Manual trigger for the rental renewal reminder cron (UC-NT-08).
 *
 *   npx tsx scripts/cron-rental-renewal.ts
 */

import { runRentalRenewalReminder } from "@/lib/cron/rental-renewal-reminder";

async function main() {
  const start = Date.now();
  const summary = await runRentalRenewalReminder();

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

    console.error("[cron-rental-renewal] failed:", err);
    process.exit(1);
  });
