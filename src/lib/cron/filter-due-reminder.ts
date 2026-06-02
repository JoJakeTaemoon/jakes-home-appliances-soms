/**
 * Filter due reminder cron (UC-NT-06).
 *
 * For every ACTIVE Equipment whose model has compatible Consumables:
 *   - For each Consumable with a replaceEveryMonths and/or cleanEveryMonths
 *     cycle, compute the next-due date from Equipment.installedAt + the
 *     last VisitConsumableLog for that (consumableId, action).
 *   - If the next-due date is within 14 days, queue EMAIL_FILTER_DUE_D14
 *     to the primary OPS contact with `action_label` localized in the
 *     contact's preferred language (교체 / vệ sinh / replacement / cleaning).
 *   - Dedupe per (equipment + consumable + action) — re-running in the
 *     same window is a no-op.
 *
 * The legacy EquipmentModel.filterPolicy JSON is no longer consulted; the
 * Consumable + ConsumableOnModel tables are the single source of truth.
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { formatDate } from "@/lib/format";
import type { JobSummary, ScheduledJob } from "@/lib/cron/job";
import { addMonths } from "@/lib/visits/suggest";
import type { Locale } from "@/generated/prisma/client";

type CycleAction = "REPLACE" | "CLEAN";

const ACTION_LABELS: Record<CycleAction, Record<Locale, string>> = {
  REPLACE: { ko: "교체", vi: "thay lõi lọc", en: "replacement" },
  CLEAN: { ko: "청소", vi: "vệ sinh lõi lọc", en: "cleaning" },
};

function localizedConsumableName(
  c: { nameKo: string; nameVi: string; nameEn: string },
  language: Locale,
): string {
  if (language === "ko") return c.nameKo;
  if (language === "en") return c.nameEn;
  return c.nameVi;
}

export interface FilterDueRunSummary {
  equipmentScanned: number;
  notificationsQueued: number;
  notificationsDeduped: number;
  errors: { equipmentId: string; error: string }[];
}

function selectPrimaryOps(
  contacts: { id: string; role: string; isPrimary: boolean; scope: string; siteId: string | null; language: Locale }[],
  siteId: string | null,
): { id: string; language: Locale } | null {
  const ops = contacts.filter((c) => c.role === "OPS_CONTACT");
  if (siteId) {
    const siteScoped = ops.find(
      (c) => c.scope === "SITE" && c.siteId === siteId && c.isPrimary,
    );
    if (siteScoped) return { id: siteScoped.id, language: siteScoped.language };
  }
  const customerScoped = ops.find(
    (c) => c.scope === "CUSTOMER" && c.isPrimary,
  );
  if (customerScoped) return { id: customerScoped.id, language: customerScoped.language };
  const anyPrimary = ops.find((c) => c.isPrimary);
  if (anyPrimary) return { id: anyPrimary.id, language: anyPrimary.language };
  const fallback = ops[0];
  return fallback ? { id: fallback.id, language: fallback.language } : null;
}

async function hasRecentReminder(
  equipmentId: string,
  consumableId: string,
  action: CycleAction,
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
        { payload: { path: ["consumableId"], equals: consumableId } as never },
        { payload: { path: ["action"], equals: action } as never },
      ],
    },
    select: { id: true },
  });
  return !!existing;
}

interface EquipmentRow {
  id: string;
  siteId: string | null;
  installedAt: Date | null;
  model: {
    nameKo: string | null;
    nameVi: string | null;
    nameEn: string | null;
    modelCode: string | null;
    consumables: {
      consumable: {
        id: string;
        sku: string;
        nameKo: string;
        nameVi: string;
        nameEn: string;
        replaceEveryMonths: number | null;
        cleanEveryMonths: number | null;
        isActive: boolean;
      };
    }[];
  };
  customer: {
    id: string;
    name: string;
    contacts: {
      id: string;
      role: string;
      scope: string;
      siteId: string | null;
      isPrimary: boolean;
      language: Locale;
    }[];
  };
}

async function processOne(
  eq: EquipmentRow,
  now: Date,
  reminderWindow: number,
  summary: FilterDueRunSummary,
): Promise<void> {
  if (!eq.installedAt) return;
  const activeConsumables = eq.model.consumables
    .map((c) => c.consumable)
    .filter((c) => c.isActive);
  if (activeConsumables.length === 0) return;

  const logs = await prisma.visitConsumableLog.findMany({
    where: {
      visit: { equipmentId: eq.id },
      consumableId: { in: activeConsumables.map((c) => c.id) },
    },
    select: { consumableId: true, action: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastByKey = new Map<string, Date>();
  for (const log of logs) {
    const key = `${log.consumableId}:${log.action}`;
    if (!lastByKey.has(key)) lastByKey.set(key, log.createdAt);
  }

  for (const c of activeConsumables) {
    for (const action of ["REPLACE", "CLEAN"] as CycleAction[]) {
      const cycle = action === "REPLACE" ? c.replaceEveryMonths : c.cleanEveryMonths;
      if (cycle == null) continue;
      const baseline = lastByKey.get(`${c.id}:${action}`) ?? eq.installedAt;
      if (!baseline) continue;
      const nextDue = addMonths(baseline, cycle);
      const daysUntilDue = Math.floor(
        (nextDue.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysUntilDue < 0 || daysUntilDue > reminderWindow) continue;

      if (await hasRecentReminder(eq.id, c.id, action, reminderWindow)) {
        summary.notificationsDeduped += 1;
        continue;
      }

      const primary = selectPrimaryOps(eq.customer.contacts, eq.siteId ?? null);
      if (!primary) continue;
      const actionLabel = ACTION_LABELS[action][primary.language] ?? ACTION_LABELS[action].vi;

      try {
        const results = await sendNotification({
          templateCode: "EMAIL_FILTER_DUE_D14",
          customerContactId: primary.id,
          vars: {
            name: eq.customer.name,
            equipment: `${eq.model.nameVi ?? eq.model.nameKo ?? eq.model.nameEn ?? eq.model.modelCode ?? ""} (${eq.model.modelCode ?? ""})`,
            days: String(Math.max(daysUntilDue, 0)),
            date: formatDate(nextDue, "vi"),
            action_label: actionLabel,
            part_name: localizedConsumableName(c, primary.language),
            url: "/equipment",
          },
          actorType: "SYSTEM",
        });
        summary.notificationsQueued += results.filter((r) => r.status !== "SKIPPED").length;
        for (const r of results) {
          await prisma.notificationLog.update({
            where: { id: r.notificationLogId },
            data: {
              payload: {
                equipmentId: eq.id,
                consumableId: c.id,
                consumableSku: c.sku,
                action,
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
  }
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

  const equipment = (await prisma.equipment.findMany({
    where: {
      status: "ACTIVE",
      installedAt: { not: null },
    },
    select: {
      id: true,
      siteId: true,
      installedAt: true,
      model: {
        select: {
          nameKo: true,
          nameVi: true,
          nameEn: true,
          modelCode: true,
          consumables: {
            select: {
              consumable: {
                select: {
                  id: true,
                  sku: true,
                  nameKo: true,
                  nameVi: true,
                  nameEn: true,
                  replaceEveryMonths: true,
                  cleanEveryMonths: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
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
              language: true,
            },
          },
        },
      },
    },
  })) as EquipmentRow[];

  summary.equipmentScanned = equipment.length;
  for (const eq of equipment) {
    try {
      await processOne(eq, now, reminderWindow, summary);
    } catch (err) {
      summary.errors.push({
        equipmentId: eq.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return summary;
}

/**
 * `ScheduledJob` adapter — the canonical export for `/api/cron/*` routes.
 * Retains legacy domain fields (`equipmentScanned`, `notificationsQueued`,
 * `notificationsDeduped`, `errors`) on the wire.
 */
export const filterDueReminderJob: ScheduledJob = {
  name: "filter-due-reminder",
  async run({ now }): Promise<JobSummary> {
    const r = await runFilterDueReminder({ now });
    return {
      jobName: "filter-due-reminder",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      itemsProcessed: r.notificationsQueued,
      itemsSkipped: r.notificationsDeduped,
      itemsFailed: r.errors.length,
      equipmentScanned: r.equipmentScanned,
      notificationsQueued: r.notificationsQueued,
      notificationsDeduped: r.notificationsDeduped,
      errors: r.errors,
    };
  },
};
