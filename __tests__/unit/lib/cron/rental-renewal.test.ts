import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    contract: { findMany: vi.fn() },
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
import { runRentalRenewalReminder } from "@/lib/cron/rental-renewal-reminder";

const mockedPrisma = vi.mocked(prisma, true);
const mockedSend = vi.mocked(sendNotification);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeContract(daysOut: number, id = "co1") {
  const now = new Date("2026-06-15T00:00:00Z");
  return {
    id,
    endDate: new Date(now.getTime() + daysOut * 24 * 60 * 60 * 1000),
    monthlyMaintenanceFee: { toString: () => "150000" },
    customer: {
      id: "c1",
      name: "Acme",
      contacts: [{ id: "cp", role: "CONTRACT_PARTY", isPrimary: false }],
    },
    equipment: [
      { equipment: { model: { name: "PTS-2100", modelCode: "PTS-2100" } } },
    ],
  };
}

describe("runRentalRenewalReminder", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("sends EMAIL_RENTAL_DUE_D60 at D-60", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([makeContract(60)] as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as never);
    const r = await runRentalRenewalReminder({ now });
    expect(r.notificationsQueued).toBeGreaterThanOrEqual(1);
    const codes = mockedSend.mock.calls.map((c) => c[0].templateCode);
    expect(codes).toContain("EMAIL_RENTAL_DUE_D60");
  });

  it("sends EMAIL_RENTAL_DUE_D30 at D-30", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([makeContract(30)] as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as never);
    const r = await runRentalRenewalReminder({ now });
    expect(r.notificationsQueued).toBeGreaterThanOrEqual(1);
    const codes = mockedSend.mock.calls.map((c) => c[0].templateCode);
    expect(codes).toContain("EMAIL_RENTAL_DUE_D30");
  });

  it("sends SMS_CONTRACT_RENEWAL_FINAL at D-7", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([makeContract(7)] as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as never);
    const r = await runRentalRenewalReminder({ now });
    const codes = mockedSend.mock.calls.map((c) => c[0].templateCode);
    expect(codes).toContain("SMS_CONTRACT_RENEWAL_FINAL");
    expect(r.notificationsQueued).toBeGreaterThanOrEqual(1);
  });

  it("dedupes by NotificationLog", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([makeContract(30)] as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue({ id: "recent" } as never);
    const r = await runRentalRenewalReminder({ now });
    expect(r.notificationsDeduped).toBe(1);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
