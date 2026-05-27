import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    equipment: { findMany: vi.fn() },
    notificationLog: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/notifications/send", () => ({
  sendNotification: vi.fn().mockResolvedValue([
    { notificationLogId: "log-1", status: "MOCKED" },
  ]),
}));

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { runFilterDueReminder } from "@/lib/cron/filter-due-reminder";

const mockedPrisma = vi.mocked(prisma, true);
const mockedSend = vi.mocked(sendNotification);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runFilterDueReminder", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("queues EMAIL_FILTER_DUE_D14 when next-due is within 14 days", async () => {
    // Installed 355 days ago + 365d cycle → 10 days remaining (within window)
    const installedAt = new Date(now.getTime() - 355 * 24 * 60 * 60 * 1000);
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      {
        id: "eq1",
        siteId: null,
        installedAt,
        filterPolicyOverride: null,
        model: {
          name: "PTS-2100",
          modelCode: "PTS-2100",
          filterPolicy: {
            filters: [{ type: "SEDIMENT", replaceEveryDays: 365 }],
          },
        },
        customer: {
          id: "c1",
          name: "Acme",
          contacts: [
            {
              id: "op",
              role: "OPS_CONTACT",
              scope: "CUSTOMER",
              siteId: null,
              isPrimary: true,
            },
          ],
        },
        visits: [],
      },
    ] as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as never);

    const r = await runFilterDueReminder({ now });
    expect(r.notificationsQueued).toBe(1);
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "EMAIL_FILTER_DUE_D14" }),
    );
  });

  it("skips equipment with no filterPolicy", async () => {
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      {
        id: "eq1",
        installedAt: new Date(),
        filterPolicyOverride: null,
        model: { name: "PTS-2100", modelCode: "PTS-2100", filterPolicy: null },
        customer: { id: "c1", name: "Acme", contacts: [] },
        visits: [],
      },
    ] as never);
    const r = await runFilterDueReminder({ now });
    expect(r.notificationsQueued).toBe(0);
  });

  it("dedupes by NotificationLog payload", async () => {
    const installedAt = new Date(now.getTime() - 355 * 24 * 60 * 60 * 1000);
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      {
        id: "eq1",
        siteId: null,
        installedAt,
        filterPolicyOverride: null,
        model: {
          name: "PTS-2100",
          modelCode: "PTS-2100",
          filterPolicy: {
            filters: [{ type: "SEDIMENT", replaceEveryDays: 365 }],
          },
        },
        customer: {
          id: "c1",
          name: "Acme",
          contacts: [
            {
              id: "op",
              role: "OPS_CONTACT",
              scope: "CUSTOMER",
              siteId: null,
              isPrimary: true,
            },
          ],
        },
        visits: [],
      },
    ] as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue({ id: "recent" } as never);

    const r = await runFilterDueReminder({ now });
    expect(r.notificationsDeduped).toBe(1);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
