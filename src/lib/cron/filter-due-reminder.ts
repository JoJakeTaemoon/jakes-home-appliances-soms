/**
 * Filter due reminder cron (UC-NT-06).
 *
 *   For every ACTIVE Equipment with a filterPolicy:
 *     - For each filter entry, compute the next-due date from `installedAt`
 *       plus the last replacement of that filter type recorded in a Visit's
 *       `partsReplaced` JSON.
 *     - If the next-due date is within 14 days, queue EMAIL_FILTER_DUE_D14
 *       to the primary OPS contact.
 *     - Dedupe per (equipment + filter type + cycle) — re-running the cron
 *       in the same 14-day window is a no-op.
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { formatDate } from "@/lib/format";

interface FilterPolicyEntry {
  type: string;
  replaceEveryDays: number;
}

function parseFilterPolicy(raw: unknown): FilterPolicyEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const wrap = raw as { filters?: unknown };
  if (!Array.isArray(wrap.filters)) return [];
  const out: FilterPolicyEntry[] = [];
  for (const f of wrap.filters) {
    if (!f || typeof f !== "object") continue;
    const e = f as { type?: unknown; replaceEveryDays?: unknown };
    if (typeof e.type === "string" && typeof e.replaceEveryDays === "number") {
      out.push({ type: e.type, replaceEveryDays: e.replaceEveryDays });
    }
  }
  return out;
}

function parsePartsReplaced(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string");
}

export interface FilterDueRunSummary {
  equipmentScanned: number;
  notificationsQueued: number;
  notificationsDeduped: number;
  errors: { equipmentId: string; error: string }[];
}

function selectPrimaryOps(
  contacts: { id: string; role: string; isPrimary: boolean; scope: string; siteId: string | null }[],
  siteId: string | null,
): string | null {
  const ops = contacts.filter((c) => c.role === "OPS_CONTACT");
  if (siteId) {
    const siteScoped = ops.find(
      (c) => c.scope === "SITE" && c.siteId === siteId && c.isPrimary,
    );
    if (siteScoped) return siteScoped.id;
  }
  const customerScoped = ops.find(
    (c) => c.scope === "CUSTOMER" && c.isPrimary,
  );
  if (customerScoped) return customerScoped.id;
  const anyPrimary = ops.find((c) => c.isPrimary);
  if (anyPrimary) return anyPrimary.id;
  return ops[0]?.id ?? null;
}

async function hasRecentFilterReminder(
  equipmentId: string,
  filterType: string,
  windowDays: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const existing = await prisma.notificationLog.findFirst({
    where: {
      templateCode: "EMAIL_FILTER_DUE_D14",
      createdAt: { gte: since },
      status: { in: ["SENT", "MOCKED", "QUEUED"] },
      AND: [
        { payload: { path: ["equipmentId"], equals: equipmentId } as never },
        { payload: { path: ["filterType"], equals: filterType } as never },
      ],
    },
    select: { id: true },
  });
  return !!existing;
}

export async function runFilterDueReminder(
  opts: { now?: Date; reminderWindowDays?: number } = {},
): Promise<FilterDueRunSummary> {
  const now = opts.now ?? new Date();
  const reminderWindow = opts.reminderWindowDays ?? 14;

  const summary: FilterDueRunSummary = {
    equipmentScanned: 0,
    notificationsQueued: 0,
    notificationsDeduped: 0,
    errors: [],
  };

  const equipment = await prisma.equipment.findMany({
    where: {
      status: "ACTIVE",
      installedAt: { not: null },
    },
    include: {
      model: { select: { name: true, modelCode: true, filterPolicy: true } },
      customer: {
        select: {
          id: true,
          name: true,
          contacts: {
            select: {
              id: true,
              role: true,
              scope: true,
              siteId: true,
              isPrimary: true,
            },
          },
        },
      },
      visits: {
        where: { state: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { id: true, completedAt: true, partsReplaced: true },
      },
    },
  });
  summary.equipmentScanned = equipment.length;

  for (const eq of equipment) {
    try {
      const policyRaw =
        (eq.filterPolicyOverride as unknown) ?? eq.model.filterPolicy ?? null;
      const policy = parseFilterPolicy(policyRaw);
      if (policy.length === 0) continue;
      if (!eq.installedAt) continue;

      for (const filter of policy) {
        // Find the last visit that replaced this filter type.
        let baseline = eq.installedAt;
        for (const v of eq.visits) {
          const parts = parsePartsReplaced(v.partsReplaced);
          const replaced = parts.some((p) =>
            p.toLowerCase().includes(filter.type.toLowerCase()),
          );
          if (replaced && v.completedAt) {
            baseline = v.completedAt;
            break; // visits are sorted desc — first hit is the latest
          }
        }
        const nextDue = new Date(
          baseline.getTime() + filter.replaceEveryDays * 24 * 60 * 60 * 1000,
        );
        const daysUntilDue = Math.floor(
          (nextDue.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        );
        if (daysUntilDue < 0 || daysUntilDue > reminderWindow) continue;

        if (await hasRecentFilterReminder(eq.id, filter.type, reminderWindow)) {
          summary.notificationsDeduped += 1;
          continue;
        }

        const contactId = selectPrimaryOps(
          eq.customer.contacts,
          eq.siteId ?? null,
        );
        if (!contactId) continue;

        try {
          const results = await sendNotification({
            templateCode: "EMAIL_FILTER_DUE_D14",
            customerContactId: contactId,
            vars: {
              name: eq.customer.name,
              equipment: `${eq.model.name} (${eq.model.modelCode})`,
              days: String(Math.max(daysUntilDue, 0)),
              date: formatDate(nextDue, "vi"),
              url: "/portal/equipment",
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
                  equipmentId: eq.id,
                  filterType: filter.type,
                  nextDue: nextDue.toISOString(),
                } as never,
              },
            });
          }
        } catch (err) {
          summary.errors.push({
            equipmentId: eq.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      summary.errors.push({
        equipmentId: eq.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
