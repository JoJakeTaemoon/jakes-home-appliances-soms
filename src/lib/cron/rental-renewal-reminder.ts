/**
 * Rental renewal reminder cron (UC-NT-08).
 *
 *   For every ACTIVE rental contract:
 *     D-60: EMAIL_RENTAL_DUE_D60 → CONTRACT_PARTY
 *     D-30: EMAIL_RENTAL_DUE_D30
 *     D-7 : SMS_CONTRACT_RENEWAL_FINAL
 *
 *   Dedupe per (contractId + templateCode + day-window).
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { formatDate, formatVnd } from "@/lib/format";
import type { JobSummary, ScheduledJob } from "@/lib/cron/job";

const STAGES: Array<{
  daysOut: number;
  template: string;
  tolerance: number;
}> = [
  { daysOut: 60, template: "EMAIL_RENTAL_DUE_D60", tolerance: 2 },
  { daysOut: 30, template: "EMAIL_RENTAL_DUE_D30", tolerance: 2 },
  { daysOut: 7, template: "SMS_CONTRACT_RENEWAL_FINAL", tolerance: 1 },
];

export interface RenewalRunSummary {
  scanned: number;
  notificationsQueued: number;
  notificationsDeduped: number;
  errors: { contractId: string; error: string }[];
}

function selectContractParty(
  contacts: { id: string; role: string; isPrimary: boolean }[],
): string | null {
  const cp = contacts.find((c) => c.role === "CONTRACT_PARTY");
  return cp?.id ?? null;
}

async function hasRecentReminder(
  contractId: string,
  templateCode: string,
  hours = 24,
): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const existing = await prisma.notificationLog.findFirst({
    where: {
      templateCode,
      createdAt: { gte: since },
      status: { in: ["SENT", "MOCKED", "QUEUED"] },
      payload: { path: ["contractId"], equals: contractId } as never,
    },
    select: { id: true },
  });
  return !!existing;
}

export async function runRentalRenewalReminder(
  opts: { now?: Date } = {},
): Promise<RenewalRunSummary> {
  const now = opts.now ?? new Date();
  const summary: RenewalRunSummary = {
    scanned: 0,
    notificationsQueued: 0,
    notificationsDeduped: 0,
    errors: [],
  };

  // Maximum lookahead is 60 days + tolerance.
  const horizon = new Date(now.getTime() + 62 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.contract.findMany({
    where: {
      type: "RENTAL",
      state: "ACTIVE",
      endDate: { gt: now, lte: horizon },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          contacts: { select: { id: true, role: true, isPrimary: true } },
        },
      },
      equipment: {
        select: {
          equipment: { select: { model: { select: { nameKo: true, nameVi: true, nameEn: true, modelCode: true } } } },
        },
      },
    },
  });
  summary.scanned = candidates.length;

  for (const c of candidates) {
    if (!c.endDate) continue;
    const daysOut = Math.floor(
      (c.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );

    const stage = STAGES.find(
      (s) => Math.abs(daysOut - s.daysOut) <= s.tolerance,
    );
    if (!stage) continue;

    if (await hasRecentReminder(c.id, stage.template)) {
      summary.notificationsDeduped += 1;
      continue;
    }
    const contactId = selectContractParty(c.customer.contacts);
    if (!contactId) continue;

    const equipmentList = c.equipment
      .map((ce) => {
        const m = ce.equipment.model;
        const name = m.nameVi ?? m.nameKo ?? m.nameEn ?? m.modelCode ?? "";
        return `${name} (${m.modelCode ?? ""})`;
      })
      .join(", ");
    const maintenanceFee = c.monthlyMaintenanceFee
      ? formatVnd(c.monthlyMaintenanceFee.toString())
      : "—";

    try {
      const results = await sendNotification({
        templateCode: stage.template,
        customerContactId: contactId,
        vars: {
          name: c.customer.name,
          date: formatDate(c.endDate, "vi"),
          days: String(daysOut),
          equipment_list: equipmentList || "—",
          maintenance_fee: maintenanceFee,
          url: "/equipment",
          hq_phone: "+84-28-1234-5678",
        },
        actorType: "SYSTEM",
      });
      summary.notificationsQueued += results.filter(
        (r) => r.status !== "SKIPPED",
      ).length;
      for (const r of results) {
        await prisma.notificationLog.update({
          where: { id: r.notificationLogId },
          data: {
            payload: {
              contractId: c.id,
              templateCode: stage.template,
              daysOut,
            } as never,
          },
        });
      }
    } catch (err) {
      summary.errors.push({
        contractId: c.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

/**
 * `ScheduledJob` adapter — canonical export for `/api/cron/rental-renewal/route.ts`.
 */
export const rentalRenewalReminderJob: ScheduledJob = {
  name: "rental-renewal-reminder",
  async run({ now }): Promise<JobSummary> {
    const r = await runRentalRenewalReminder({ now });
    return {
      jobName: "rental-renewal-reminder",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      itemsProcessed: r.notificationsQueued,
      itemsSkipped: r.notificationsDeduped,
      itemsFailed: r.errors.length,
      scanned: r.scanned,
      notificationsQueued: r.notificationsQueued,
      notificationsDeduped: r.notificationsDeduped,
      errors: r.errors,
    };
  },
};

