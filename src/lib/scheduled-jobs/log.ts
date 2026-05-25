import prisma from '@/lib/prisma';

/**
 * 2026-05-24 — Single entry point that scheduled-job handlers (cron +
 * manual triggers) call to record one row in `ScheduledJobRun`. Keeping
 * the writer here means every job uses the same column conventions and
 * the admin history UI can render `outcome` JSON without per-job
 * special cases.
 *
 * `outcome` is intentionally `unknown` — callers pass whatever shape
 * their job produces (BackfillOutcome, { reason: string }, etc.) and we
 * persist as-is.
 */
export type JobTrigger = 'CRON' | 'MANUAL';
export type JobStatus = 'OK' | 'SKIPPED' | 'FAILED';

export async function recordScheduledJobRun(args: {
  jobKey: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: Date;
  finishedAt: Date;
  outcome?: unknown;
  triggeredById?: string | null;
}): Promise<void> {
  try {
    await prisma.scheduledJobRun.create({
      data: {
        jobKey: args.jobKey,
        trigger: args.trigger,
        status: args.status,
        startedAt: args.startedAt,
        finishedAt: args.finishedAt,
        durationMs: args.finishedAt.getTime() - args.startedAt.getTime(),
        // Prisma's Json? field rejects raw `null`; omit when caller
        // didn't supply an outcome so the column stays NULL by default.
        ...(args.outcome === undefined
          ? {}
          : { outcome: args.outcome as object }),
        triggeredById: args.triggeredById ?? null,
      },
    });
  } catch (err) {
    // Audit logging is best-effort — a write failure here must not
    // break the job itself. Mirror the pattern action-log.ts uses.
    console.error('[scheduled-jobs/log] failed to write run row:', err);
  }
}
