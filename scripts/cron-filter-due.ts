/**
 * Manual trigger for the filter due reminder cron (UC-NT-06).
 *
 *   npx tsx scripts/cron-filter-due.ts
 */

import { runFilterDueReminder } from "@/lib/cron/filter-due-reminder";

async function main() {
  const start = Date.now();
  const summary = await runFilterDueReminder();

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

    console.error("[cron-filter-due] failed:", err);
    process.exit(1);
  });
