/**
 * Cash handover SLA alert cron (48h audit rule).
 *
 *   Finds Payments in state COLLECTED with `collectedAt < now - 48h`. For
 *   each, write an AuditLog category=ALERT row (so the manager dashboard
 *   can surface them) and dispatch a generic admin email via the notification
 *   factory if the manager email is configured.
 *
 *   Idempotent: dedupe on AuditLog (entityType=Payment + action=PAYMENT_HANDOVER_SLA_BREACH)
 *   within the last 24h.
 */

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const SLA_HOURS = 48;
const DEDUPE_HOURS = 24;

export interface CashHandoverAlertSummary {
  scanned: number;
  flagged: number;
  deduped: number;
}

export async function runCashHandoverAlert(
  opts: { now?: Date; slaHours?: number } = {},
): Promise<CashHandoverAlertSummary> {
  const now = opts.now ?? new Date();
  const slaHours = opts.slaHours ?? SLA_HOURS;
  const cutoff = new Date(now.getTime() - slaHours * 60 * 60 * 1000);

  const candidates = await prisma.payment.findMany({
    where: {
      state: "COLLECTED",
      collectedAt: { lt: cutoff },
      method: "CASH",
    },
    select: {
      id: true,
      collectedAt: true,
      collectedById: true,
      actualAmount: true,
      customerId: true,
    },
  });

  const summary: CashHandoverAlertSummary = {
    scanned: candidates.length,
    flagged: 0,
    deduped: 0,
  };

  const dedupeSince = new Date(now.getTime() - DEDUPE_HOURS * 60 * 60 * 1000);

  for (const p of candidates) {
    const recent = await prisma.auditLog.findFirst({
      where: {
        action: "PAYMENT_HANDOVER_SLA_BREACH",
        entityType: "Payment",
        entityId: p.id,
        at: { gte: dedupeSince },
      },
      select: { id: true },
    });
    if (recent) {
      summary.deduped += 1;
      continue;
    }
    const hoursOverdue = Math.floor(
      (now.getTime() - (p.collectedAt?.getTime() ?? now.getTime())) /
        (60 * 60 * 1000),
    );
    await logAudit({
      actorType: "SYSTEM",
      action: "PAYMENT_HANDOVER_SLA_BREACH",
      entityType: "Payment",
      entityId: p.id,
      after: {
        hoursOverdue,
        customerId: p.customerId,
        collectedById: p.collectedById,
        actualAmount: Number(p.actualAmount.toString()),
      },
    });
    summary.flagged += 1;
  }

  return summary;
}
