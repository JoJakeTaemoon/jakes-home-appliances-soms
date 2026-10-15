/**
 * Visit reminder cron (UC-VS-10).
 *
 *   runVisitReminderD1() — finds SCHEDULED visits whose `scheduledFor` falls
 *   on tomorrow's VST calendar day (00:00–24:00 Asia/Ho_Chi_Minh). The job
 *   runs once a day (16:00 VST), so a window relative to the run time would
 *   only catch the visits booked around 16:00. For each visit, picks the
 *   recipient using the same OPS-contact precedence as the completion email:
 *
 *     1. Primary OPS contact scoped to the visit's site (if any)
 *     2. Primary OPS contact scoped to the customer
 *     3. Any OPS contact
 *     4. CONTRACT_PARTY (fallback)
 *
 *   Dedup: skip if NotificationLog already has a SENT/MOCKED reminder for
 *   this visit at this slot (`payload.vars.visit_id` + `date` + `time`), so a
 *   re-run is a no-op while a rescheduled visit is reminded for its new slot.
 *
 *   This module exports the function as `runVisitReminderD1` and a script in
 *   `scripts/cron-visit-reminder.ts` invokes it. Phase 6 will wire to Vercel
 *   Cron.
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { formatDateTime, toAsciiVi } from "@/lib/format";
import { pickEquipmentLabel } from "@/lib/products/name";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Vietnam is UTC+7 year-round (no DST), so a fixed offset is exact. */
const VST_OFFSET = 7 * HOUR;

/** [start, end) of the VST calendar day after the one `now` falls on. */
function tomorrowVst(now: Date): { start: Date; end: Date } {
  const todayStart =
    Math.floor((now.getTime() + VST_OFFSET) / DAY) * DAY - VST_OFFSET;
  return {
    start: new Date(todayStart + DAY),
    end: new Date(todayStart + 2 * DAY),
  };
}

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

/**
 * `date` + `time` are the UTC slices of `scheduledFor` that every reminder has
 * carried in its vars, so together with `visit_id` they key "this visit at
 * this slot" — rows written before this check existed still match. Not keyed
 * on the contact: if the primary OPS changes between runs, the visit has
 * still been announced.
 */
async function alreadyReminded(
  visitId: string,
  date: string,
  time: string,
): Promise<boolean> {
  const log = await prisma.notificationLog.findFirst({
    where: {
      templateCode: "SMS_VISIT_REMINDER",
      status: { in: ["SENT", "MOCKED"] },
      AND: [
        { payload: { path: ["vars", "visit_id"], equals: visitId } },
        { payload: { path: ["vars", "date"], equals: date } },
        { payload: { path: ["vars", "time"], equals: time } },
      ],
    },
    select: { id: true },
  });
  return log !== null;
}

export async function runVisitReminderD1(
  now: Date = new Date(),
): Promise<ReminderStats> {
  const { start: winStart, end: winEnd } = tomorrowVst(now);

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
      equipment: {
        select: {
          customDescription: true,
          serialNumber: true,
          model: {
            select: {
              nameKo: true,
              nameVi: true,
              nameEn: true,
              modelCode: true,
            },
          },
        },
      },
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
    const dateStr = v.scheduledFor.toISOString().slice(0, 10);
    const timeStr = v.scheduledFor.toISOString().slice(11, 16);
    if (await alreadyReminded(v.id, dateStr, timeStr)) {
      stats.skipped += 1;
      continue;
    }
    try {
      // The eSMS-approved body has two slots: equipment (50 chars) and the
      // appointment moment (40). Only Vietnamese and English bodies are
      // registered, so Korean contacts get the Vietnamese wording — and with
      // it the Vietnamese date format. Accents are folded because the
      // approved text is plain GSM-7.
      const smsLocale = pick.language === "en" ? "en" : "vi";
      const equipment = v.equipment
        ? pickEquipmentLabel(v.equipment, smsLocale)
        : smsLocale === "en"
          ? "equipment"
          : "thiet bi";
      const results = await sendNotification({
        templateCode: "SMS_VISIT_REMINDER",
        customerContactId: pick.contactId,
        vars: {
          name: pick.customerName,
          date: dateStr,
          time: timeStr,
          technician: pick.technician,
          service: v.type,
          equipment: toAsciiVi(equipment).slice(0, 50),
          datetime: formatDateTime(v.scheduledFor, smsLocale).slice(0, 40),
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
