/**
 * Visit reminder cron (UC-VS-10).
 *
 *   runVisitReminderD1() — finds SCHEDULED visits with `scheduledFor` between
 *   23h and 25h from `now`. For each visit, picks the recipient using the
 *   same OPS-contact precedence as the completion email:
 *
 *     1. Primary OPS contact scoped to the visit's site (if any)
 *     2. Primary OPS contact scoped to the customer
 *     3. Any OPS contact
 *     4. CONTRACT_PARTY (fallback)
 *
 *   Dedup: skip if NotificationLog already has a SENT/MOCKED row with the
 *   same `templateCode + contactId` whose `payload.visitId === visit.id`.
 *
 *   This module exports the function as `runVisitReminderD1` and a script in
 *   `scripts/cron-visit-reminder.ts` invokes it. Phase 6 will wire to Vercel
 *   Cron.
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";

const HOUR = 60 * 60 * 1000;

interface ReminderStats {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
}

interface ContactPick {
  contactId: string;
  language: "ko" | "vi" | "en";
  technician: string;
  customerName: string;
}

async function pickRecipient(visit: {
  id: string;
  siteId: string | null;
  customerId: string;
  leadTechnicianId: string | null;
}): Promise<ContactPick | null> {
  const [customer, lead] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: visit.customerId },
      select: {
        name: true,
        contacts: {
          select: {
            id: true,
            role: true,
            scope: true,
            siteId: true,
            isPrimary: true,
            language: true,
          },
        },
      },
    }),
    visit.leadTechnicianId
      ? prisma.user.findUnique({
          where: { id: visit.leadTechnicianId },
          select: { username: true },
        })
      : Promise.resolve(null),
  ]);
  if (!customer) return null;

  const ops = customer.contacts.filter((c) => c.role === "OPS_CONTACT");
  const contract = customer.contacts.find((c) => c.role === "CONTRACT_PARTY");

  let chosen = null as
    | (typeof customer.contacts)[number]
    | null;

  if (visit.siteId) {
    chosen =
      ops.find(
        (c) => c.scope === "SITE" && c.siteId === visit.siteId && c.isPrimary,
      ) ?? null;
  }
  if (!chosen) {
    chosen = ops.find((c) => c.scope === "CUSTOMER" && c.isPrimary) ?? null;
  }
  if (!chosen) chosen = ops.find((c) => c.isPrimary) ?? null;
  if (!chosen) chosen = ops[0] ?? null;
  if (!chosen) chosen = contract ?? null;
  if (!chosen) return null;

  return {
    contactId: chosen.id,
    language: chosen.language,
    technician: lead?.username ?? "—",
    customerName: customer.name,
  };
}

async function alreadyReminded(
  visitId: string,
  contactId: string,
): Promise<boolean> {
  const log = await prisma.notificationLog.findFirst({
    where: {
      contactId,
      templateCode: "SMS_VISIT_REMINDER",
      status: { in: ["SENT", "MOCKED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, payload: true },
  });
  if (!log) return false;
  // The payload includes the templated vars dict — sendNotification stamps
  // them onto the row. We re-check the visitId so the same OPS contact can
  // still be reminded about a *different* visit on the same day.
  const payload = log.payload as Record<string, unknown> | null;
  if (!payload) return false;
  const vars = payload.vars as Record<string, unknown> | undefined;
  if (vars && typeof vars.visit_id === "string" && vars.visit_id === visitId) {
    return true;
  }
  return false;
}

export async function runVisitReminderD1(
  now: Date = new Date(),
): Promise<ReminderStats> {
  const winStart = new Date(now.getTime() + 23 * HOUR);
  const winEnd = new Date(now.getTime() + 25 * HOUR);

  const visits = await prisma.visit.findMany({
    where: {
      state: "SCHEDULED",
      scheduledFor: { gte: winStart, lt: winEnd },
    },
    select: {
      id: true,
      customerId: true,
      siteId: true,
      leadTechnicianId: true,
      scheduledFor: true,
      type: true,
    },
  });

  const stats: ReminderStats = {
    candidates: visits.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const v of visits) {
    const pick = await pickRecipient(v);
    if (!pick) {
      stats.skipped += 1;
      continue;
    }
    if (await alreadyReminded(v.id, pick.contactId)) {
      stats.skipped += 1;
      continue;
    }
    try {
      const dateStr = v.scheduledFor.toISOString().slice(0, 10);
      const timeStr = v.scheduledFor.toISOString().slice(11, 16);
      const results = await sendNotification({
        templateCode: "SMS_VISIT_REMINDER",
        customerContactId: pick.contactId,
        vars: {
          name: pick.customerName,
          date: dateStr,
          time: timeStr,
          technician: pick.technician,
          service: v.type,
          url: `/portal/visits/${v.id}`,
          visit_id: v.id,
        },
        actorType: "SYSTEM",
      });
      const sentOk = results.some(
        (r) => r.status === "SENT" || r.status === "MOCKED",
      );
      if (sentOk) stats.sent += 1;
      else stats.failed += 1;
    } catch (err) {
      console.error("[cron-reminder] send failed", err);
      stats.failed += 1;
    }
  }

  return stats;
}
