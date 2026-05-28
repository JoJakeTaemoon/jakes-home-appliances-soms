/**
 * Manual trigger for the overdue escalation cron (UC-PY-06).
 *
 *   npx tsx scripts/cron-overdue-escalation.ts
 *
 * Phase 6: declared in `vercel.json` as `0 1 * * *` (01:00 VST daily).
 */

import { runOverdueEscalation } from "@/lib/cron/overdue-escalation";

async function main() {
  const start = Date.now();
  const summary = await runOverdueEscalation();
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
    console.error("[cron-overdue-escalation] failed:", err);
    process.exit(1);
  });
