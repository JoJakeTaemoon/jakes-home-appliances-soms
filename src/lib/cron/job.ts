/**
 * Shared base for every scheduled job in the system.
 *
 * Before this module each cron lived as a bespoke `runXxx()` function with
 * its own ad-hoc summary shape and its own — sometimes missing — AuditLog
 * write. After this module:
 *
 *   - Every job implements the `ScheduledJob` interface:
 *       `readonly name: string;`
 *       `run(opts): Promise<JobSummary>`
 *   - Routes call `runJob(job)` which wraps the job's `.run()` with timing
 *     and writes a `CRON_RUN` AuditLog row tagged with `entityType=ScheduledJob`
 *     + `entityId=job.name`.
 *   - Every `/api/cron/*` route has the same 3-line body.
 *
 * The legacy per-job summary fields are still returned inside `JobSummary.notes`
 * + `itemsProcessed/skipped/failed`; if a caller relies on a richer
 * domain-specific summary (e.g. `paymentsCreated`), the job adds those fields
 * to its returned object — `JobSummary` is open via index signature.
 *
 * Dedup helper (`dedupePerEntity`) is exposed here for jobs that need it —
 * filter-due / overdue-escalation / rental-renewal all share the same
 * "is there a recent NotificationLog row with this template + entity tag?"
 * pattern, which used to be reimplemented inline in each job.
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface JobSummary {
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  itemsProcessed: number;
  itemsSkipped: number;
  itemsFailed: number;
  notes?: string[];
  /** Job-specific counters / details (e.g. `paymentsCreated: 12`). */
  [key: string]: unknown;
}

export interface ScheduledJob {
  readonly name: string;
  run(opts: { now?: Date }): Promise<JobSummary>;
}

/**
 * Execute a `ScheduledJob` with shared timing + AuditLog instrumentation.
 *
 * Errors thrown by `job.run()` propagate — callers (the route handler) should
 * convert to a 5xx via `toErrorResponse`. The audit row is still written for
 * the failed run so operators can spot a stuck cron in the dashboard.
 */
export async function runJob(
  job: ScheduledJob,
  opts: { now?: Date; request?: NextRequest | null } = {},
): Promise<JobSummary> {
  const now = opts.now ?? new Date();
  const startedAt = now;
  let summary: JobSummary;
  try {
    summary = await job.run({ now });
  } catch (err) {
    const finishedAt = new Date();
    await logAudit({
      actorType: "SYSTEM",
      action: "CRON_RUN",
      entityType: "ScheduledJob",
      entityId: job.name,
      request: opts.request ?? null,
      after: {
        jobName: job.name,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }

  // Stamp the standard fields on top of whatever the job returned. The job
  // is allowed to set `itemsProcessed` etc. itself but they get clobbered
  // here for jobs that didn't bother.
  const finishedAt = new Date();
  summary.jobName = job.name;
  summary.startedAt = startedAt;
  summary.finishedAt = finishedAt;
  summary.durationMs = finishedAt.getTime() - startedAt.getTime();

  await logAudit({
    actorType: "SYSTEM",
    action: "CRON_RUN",
    entityType: "ScheduledJob",
    entityId: job.name,
    request: opts.request ?? null,
    after: {
      jobName: job.name,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: summary.durationMs,
      itemsProcessed: summary.itemsProcessed,
      itemsSkipped: summary.itemsSkipped,
      itemsFailed: summary.itemsFailed,
      status: "OK",
    },
  });

  return summary;
}

/**
 * Shared dedup primitive — has a NotificationLog row for `templateCode` been
 * written in the last `withinHours` with a payload that includes the given
 * `entityId` field?
 *
 * Three of the cron jobs hand-rolled this exact query (overdue-escalation,
 * filter-due-reminder, rental-renewal-reminder). Hoisting it ensures the
 * tolerance window + status filter stays consistent across the suite.
 *
 *   await dedupePerEntity({
 *     payloadField: "paymentId",
 *     entityId: payment.id,
 *     templateCode: "EMAIL_PAYMENT_DUE_D7",
 *     withinHours: 24,
 *   })
 */
export async function dedupePerEntity(args: {
  payloadField: string;
  entityId: string;
  templateCode: string;
  withinHours?: number;
}): Promise<boolean> {
  const hours = args.withinHours ?? 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const existing = await prisma.notificationLog.findFirst({
    where: {
      templateCode: args.templateCode,
      createdAt: { gte: since },
      status: { in: ["SENT", "MOCKED", "QUEUED"] },
      payload: { path: [args.payloadField], equals: args.entityId } as never,
    },
    select: { id: true },
  });
  return !!existing;
}
