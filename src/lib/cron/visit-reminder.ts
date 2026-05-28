/**
 * `ScheduledJob` adapter for the D-1 visit-reminder cron.
 *
 * The runner lives in `@/lib/scheduler/cron-reminder` because it's
 * scheduling-domain (picks the right OPS contact + dedupes per visit). This
 * file is the cron-suite-facing adapter so `/api/cron/visit-reminder/route.ts`
 * can use the shared `runJob()` wrapper.
 */

import { runVisitReminderD1 } from "@/lib/scheduler/cron-reminder";
import type { JobSummary, ScheduledJob } from "@/lib/cron/job";

export const visitReminderJob: ScheduledJob = {
  name: "visit-reminder-d1",
  async run({ now }): Promise<JobSummary> {
    const r = await runVisitReminderD1(now ?? new Date());
    return {
      jobName: "visit-reminder-d1",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      itemsProcessed: r.sent,
      itemsSkipped: r.skipped,
      itemsFailed: r.failed,
      candidates: r.candidates,
      sent: r.sent,
      skipped: r.skipped,
      failed: r.failed,
    };
  },
};
