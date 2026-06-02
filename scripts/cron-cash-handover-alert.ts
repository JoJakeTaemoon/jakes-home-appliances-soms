/**
 * Manual trigger for the cash handover SLA cron (48h audit rule).
 *
 *   npx tsx scripts/cron-cash-handover-alert.ts
 */

import { runCashHandoverAlert } from "@/lib/cron/cash-handover-alert";

async function main() {
  const start = Date.now();
  const summary = await runCashHandoverAlert();

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

    console.error("[cron-cash-handover-alert] failed:", err);
    process.exit(1);
  });
