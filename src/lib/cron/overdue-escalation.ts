/**
 * Payment overdue escalation cron (UC-PY-06).
 *
 *   D+7  → OVERDUE_D7  + EMAIL_PAYMENT_DUE_D7
 *   D+14 → OVERDUE_D14 + EMAIL_PAYMENT_DUE_D14
 *   D+30 → OVERDUE_D30 + SMS_PAYMENT_OVERDUE_FINAL
 *
 * Idempotent: skip if a NotificationLog row for the same payment +
 * templateCode exists in the last 24h (so re-running the cron doesn't
 * double-fire).
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { markOverdue } from "@/lib/payments/operations";
import { formatVnd, formatDate } from "@/lib/format";
import type { PaymentState } from "@/lib/payments/state";
import type { JobSummary, ScheduledJob } from "@/lib/cron/job";

const STAGES: Array<{
  threshold: number;
  state: "OVERDUE_D7" | "OVERDUE_D14" | "OVERDUE_D30";
  template: string;
}> = [
  { threshold: 30, state: "OVERDUE_D30", template: "SMS_PAYMENT_OVERDUE_FINAL" },
  { threshold: 14, state: "OVERDUE_D14", template: "EMAIL_PAYMENT_DUE_D14" },
  { threshold: 7, state: "OVERDUE_D7", template: "EMAIL_PAYMENT_DUE_D7" },
];

export interface OverdueRunSummary {
  scanned: number;
  advanced: number;
  notificationsQueued: number;
  notificationsDeduped: number;
  errors: { paymentId: string; error: string }[];
}

function daysBetween(due: Date, now: Date): number {
  return Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
}

function selectRecipients(
  contacts: { id: string; role: string; isPrimary: boolean }[],
  templateCode: string,
): string[] {
  const cp = contacts.find((c) => c.role === "CONTRACT_PARTY");
  const primaryOps = contacts.find(
    (c) => c.role === "OPS_CONTACT" && c.isPrimary,
  );

  if (templateCode === "SMS_PAYMENT_OVERDUE_FINAL") {
    // Final stage: SMS to CONTRACT_PARTY; CC primary OPS.
    return [cp?.id, primaryOps?.id].filter((x): x is string => !!x);
  }
  // D+7 / D+14 emails route to CONTRACT_PARTY + primary OPS.
  return [cp?.id, primaryOps?.id].filter((x): x is string => !!x);
}

async function hasRecentNotification(
  paymentId: string,
  templateCode: string,
  hours = 24,
): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const existing = await prisma.notificationLog.findFirst({
    where: {
      templateCode,
      createdAt: { gte: since },
      status: { in: ["SENT", "MOCKED", "QUEUED"] },
      payload: { path: ["paymentId"], equals: paymentId } as never,
    },
    select: { id: true },
  });
  return !!existing;
}

export async function runOverdueEscalation(
  opts: { now?: Date } = {},
): Promise<OverdueRunSummary> {
  const now = opts.now ?? new Date();
  const summary: OverdueRunSummary = {
    scanned: 0,
    advanced: 0,
    notificationsQueued: 0,
    notificationsDeduped: 0,
    errors: [],
  };

  const candidates = await prisma.payment.findMany({
    where: {
      state: { in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14"] },
      dueDate: { lt: now },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          contacts: {
            select: { id: true, role: true, isPrimary: true },
          },
        },
      },
    },
  });
  summary.scanned = candidates.length;

  for (const p of candidates) {
    try {
      if (!p.dueDate) continue;
      const days = daysBetween(p.dueDate, now);

      // Pick the highest threshold this payment qualifies for AND that's
      // beyond its current state.
      const currentRank =
        p.state === "OVERDUE_D30"
          ? 3
          : p.state === "OVERDUE_D14"
            ? 2
            : p.state === "OVERDUE_D7"
              ? 1
              : 0;

      const target = STAGES.find((s) => days >= s.threshold);
      if (!target) continue;
      const targetRank = target.state === "OVERDUE_D30" ? 3 : target.state === "OVERDUE_D14" ? 2 : 1;
      if (targetRank <= currentRank) continue;

      // Advance state.
      await markOverdue({
        paymentId: p.id,
        stage: target.state,
      });
      summary.advanced += 1;

      // Notify (dedupe).
      if (await hasRecentNotification(p.id, target.template)) {
        summary.notificationsDeduped += 1;
        continue;
      }
      const recipients = selectRecipients(p.customer.contacts, target.template);
      for (const contactId of recipients) {
        try {
          const results = await sendNotification({
            templateCode: target.template,
            customerContactId: contactId,
            vars: {
              name: p.customer.name,
              month: formatDate(p.dueDate, "vi"),
              amount: formatVnd(p.expectedAmount.toString()),
              invoice_date: formatDate(p.createdAt, "vi"),
              due_date: formatDate(p.dueDate, "vi"),
              late_fee: "0",
              bank_info: "Vietcombank — 0123456789 — Seoul Aqua",
              next_visit: "—",
              url: `/portal/payments`,
              hq_phone: "+84-28-1234-5678",
            },
            actorType: "SYSTEM",
            actorId: null,
          });
          summary.notificationsQueued += results.filter(
            (r) => r.status !== "SKIPPED",
          ).length;

          // Tag the NotificationLog payload with paymentId so the dedupe
          // query can find it on the next run.
          for (const r of results) {
            await prisma.notificationLog.update({
              where: { id: r.notificationLogId },
              data: {
                payload: {
                  paymentId: p.id,
                  templateCode: target.template,
                } as never,
              },
            });
          }
        } catch (err) {
          summary.errors.push({
            paymentId: p.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      summary.errors.push({
        paymentId: p.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

/**
 * `ScheduledJob` adapter — the canonical export for `/api/cron/*` routes.
 * Returns an extended `JobSummary` that retains the legacy domain fields
 * (`scanned`, `advanced`, `notificationsQueued`, `notificationsDeduped`,
 * `errors`) so existing dashboards / tests keep working.
 */
export const overdueEscalationJob: ScheduledJob = {
  name: "overdue-escalation",
  async run({ now }): Promise<JobSummary> {
    const r = await runOverdueEscalation({ now });
    return {
      jobName: "overdue-escalation",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      itemsProcessed: r.advanced,
      itemsSkipped: r.notificationsDeduped,
      itemsFailed: r.errors.length,
      // Legacy domain fields preserved on the wire.
      scanned: r.scanned,
      advanced: r.advanced,
      notificationsQueued: r.notificationsQueued,
      notificationsDeduped: r.notificationsDeduped,
      errors: r.errors,
    };
  },
};

// re-export for tests that want the state type
export type { PaymentState };
