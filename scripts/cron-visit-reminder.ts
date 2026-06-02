/**
 * Manual trigger for the D-1 visit reminder cron (UC-VS-10).
 *
 *   npx tsx scripts/cron-visit-reminder.ts
 *
 * Phase 6 will wire this up as a Vercel Cron HTTP endpoint. For now the
 * script just executes the helper once and prints the summary so an
 * operator (or a test runner) can confirm the outcome.
 */

import { runVisitReminderD1 } from "@/lib/scheduler/cron-reminder";

async function main() {
  const start = Date.now();
  const summary = await runVisitReminderD1();
  const elapsedMs = Date.now() - start;

  console.log(
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        elapsedMs,
        ...summary,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {

    console.error("[cron-visit-reminder] failed:", err);
    process.exit(1);
  });
