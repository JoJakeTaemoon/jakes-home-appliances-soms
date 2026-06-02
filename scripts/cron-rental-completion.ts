/**
 * Manual trigger for the rental completion cron (UC-EQ-07).
 *
 *   npx tsx scripts/cron-rental-completion.ts
 *
 * Phase 6 will wire this up as a Vercel Cron HTTP endpoint. For now this
 * script just executes the helper once and prints the summary so an operator
 * (or a test runner) can confirm the outcome.
 */

import { runRentalCompletionCheck } from "@/lib/contracts/cron-completion";

async function main() {
  const start = Date.now();
  const summary = await runRentalCompletionCheck();
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

    console.error("[cron-rental-completion] failed:", err);
    process.exit(1);
  });
