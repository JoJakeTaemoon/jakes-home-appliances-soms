import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    equipment: { findMany: vi.fn() },
    visitConsumableLog: { findMany: vi.fn() },
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
  mockedPrisma.visitConsumableLog.findMany.mockResolvedValue([] as never);
  mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
  mockedPrisma.notificationLog.update.mockResolvedValue({} as never);
});

const now = new Date("2026-06-15T00:00:00Z");

function equipmentRow(opts: {
  installedAt: Date | null;
  consumables: {
    id: string;
    sku: string;
    nameKo?: string;
    nameVi?: string;
    nameEn?: string;
    replaceEveryMonths: number | null;
    cleanEveryMonths: number | null;
    isActive?: boolean;
  }[];
  contactLanguage?: "ko" | "vi" | "en";
}) {
  return {
    id: "eq1",
    siteId: null,
    installedAt: opts.installedAt,
    model: {
      name: "PTS-2100",
      modelCode: "PTS-2100",
      consumables: opts.consumables.map((c) => ({
        consumable: {
          id: c.id,
          sku: c.sku,
          nameKo: c.nameKo ?? "필터",
          nameVi: c.nameVi ?? "Lõi lọc",
          nameEn: c.nameEn ?? "Filter",
          replaceEveryMonths: c.replaceEveryMonths,
          cleanEveryMonths: c.cleanEveryMonths,
          isActive: c.isActive ?? true,
        },
      })),
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
          language: opts.contactLanguage ?? "vi",
        },
      ],
    },
  };
}

describe("runFilterDueReminder", () => {
  it("queues a REPLACE reminder when within 14 days", async () => {
    // installed 2025-06-25 + 12mo = 2026-06-25 → 10 days from 2026-06-15.
    const installedAt = new Date("2025-06-25T00:00:00Z");
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      equipmentRow({
        installedAt,
        consumables: [
          { id: "post", sku: "FLT-POST-001", replaceEveryMonths: 12, cleanEveryMonths: null },
        ],
      }),
    ] as never);

    const r = await runFilterDueReminder({ now });
    expect(r.notificationsQueued).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const call = mockedSend.mock.calls[0][0];
    expect(call.templateCode).toBe("EMAIL_FILTER_DUE_D14");
    expect(call.vars?.action_label).toBe("thay lõi lọc"); // contact language vi
  });

  it("uses Korean action_label when the contact prefers ko", async () => {
    const installedAt = new Date("2025-06-25T00:00:00Z");
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      equipmentRow({
        installedAt,
        contactLanguage: "ko",
        consumables: [
          { id: "post", sku: "FLT-POST-001", replaceEveryMonths: 12, cleanEveryMonths: null },
        ],
      }),
    ] as never);

    await runFilterDueReminder({ now });
    expect(mockedSend.mock.calls[0][0].vars?.action_label).toBe("교체");
  });

  it("emits BOTH a CLEAN and a REPLACE reminder when a dual-cycle consumable hits both windows", async () => {
    // RO membrane: clean every 6mo + replace every 24mo.
    // Last CLEAN 2025-12-20 + 6mo = 2026-06-20 → 5d
    // Last REPLACE 2024-06-25 + 24mo = 2026-06-25 → 10d
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      equipmentRow({
        installedAt: new Date("2024-06-25"),
        consumables: [
          { id: "ro", sku: "FLT-RO-001", replaceEveryMonths: 24, cleanEveryMonths: 6 },
        ],
      }),
    ] as never);
    mockedPrisma.visitConsumableLog.findMany.mockResolvedValueOnce([
      { consumableId: "ro", action: "REPLACE", createdAt: new Date("2024-06-25") },
      { consumableId: "ro", action: "CLEAN", createdAt: new Date("2025-12-20") },
    ] as never);

    const r = await runFilterDueReminder({ now });
    expect(r.notificationsQueued).toBe(2);
    expect(mockedSend).toHaveBeenCalledTimes(2);
    const actions = mockedSend.mock.calls.map((c) => c[0].vars?.action_label).sort();
    expect(actions).toEqual(["thay lõi lọc", "vệ sinh lõi lọc"]);
  });

  it("skips when no compatible consumables exist", async () => {
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      equipmentRow({ installedAt: new Date(), consumables: [] }),
    ] as never);
    const r = await runFilterDueReminder({ now });
    expect(r.notificationsQueued).toBe(0);
  });

  it("dedupes by (equipmentId, consumableId, action) — second run is no-op", async () => {
    const installedAt = new Date("2025-06-25T00:00:00Z");
    mockedPrisma.equipment.findMany.mockResolvedValueOnce([
      equipmentRow({
        installedAt,
        consumables: [
          { id: "post", sku: "FLT-POST-001", replaceEveryMonths: 12, cleanEveryMonths: null },
        ],
      }),
    ] as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue({ id: "recent" } as never);

    const r = await runFilterDueReminder({ now });
    expect(r.notificationsDeduped).toBe(1);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
