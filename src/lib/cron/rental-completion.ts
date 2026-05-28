/**
 * `ScheduledJob` adapter for the rental-completion cron.
 *
 * The runner itself lives in `@/lib/contracts/cron-completion` because the
 * logic is contract-domain (auto-COMPLETE + equipment ownership transfer).
 * This file is the cron-suite-facing adapter that conforms to the
 * `ScheduledJob` interface so `/api/cron/rental-completion/route.ts` can use
 * the uniform `runJob()` wrapper.
 */

import { runRentalCompletionCheck } from "@/lib/contracts/cron-completion";
import type { JobSummary, ScheduledJob } from "@/lib/cron/job";

export const rentalCompletionJob: ScheduledJob = {
  name: "rental-completion",
  async run({ now }): Promise<JobSummary> {
    const r = await runRentalCompletionCheck(now ?? new Date());
    return {
      jobName: "rental-completion",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      itemsProcessed: r.contractsCompleted,
      itemsSkipped: r.skipped.length,
      itemsFailed: 0,
      contractsScanned: r.contractsScanned,
      contractsCompleted: r.contractsCompleted,
      equipmentTransferred: r.equipmentTransferred,
      notificationsQueued: r.notificationsQueued,
      skipped: r.skipped,
    };
  },
};
