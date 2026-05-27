import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
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
import { runOverdueEscalation } from "@/lib/cron/overdue-escalation";

const mockedPrisma = vi.mocked(prisma, true);
const mockedSend = vi.mocked(sendNotification);

beforeEach(() => {
  vi.clearAllMocks();
});

function makePayment(opts: {
  id: string;
  dueDate: Date;
  state: string;
  cps?: { id: string; role: string; isPrimary: boolean }[];
}) {
  return {
    id: opts.id,
    state: opts.state,
    dueDate: opts.dueDate,
    expectedAmount: { toString: () => "500000" },
    createdAt: new Date(opts.dueDate.getTime() - 7 * 24 * 60 * 60 * 1000),
    customer: {
      id: "c1",
      name: "Acme",
      contacts:
        opts.cps ??
        [
          { id: "cp", role: "CONTRACT_PARTY", isPrimary: false },
          { id: "op", role: "OPS_CONTACT", isPrimary: true },
        ],
    },
  } as never;
}

describe("runOverdueEscalation", () => {
  const now = new Date("2026-06-20T01:00:00Z");

  it("advances D+7 → OVERDUE_D7 + sends EMAIL_PAYMENT_DUE_D7", async () => {
    const due = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    mockedPrisma.payment.findMany.mockResolvedValueOnce([
      makePayment({ id: "p1", dueDate: due, state: "EXPECTED" }),
    ]);
    mockedPrisma.payment.findUnique.mockResolvedValue({
      id: "p1",
      state: "EXPECTED",
    } as never);
    mockedPrisma.payment.update.mockResolvedValue({
      id: "p1",
      state: "OVERDUE_D7",
    } as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as never);

    const r = await runOverdueEscalation({ now });
    expect(r.advanced).toBe(1);
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "EMAIL_PAYMENT_DUE_D7" }),
    );
  });

  it("advances D+14 → OVERDUE_D14 + sends EMAIL_PAYMENT_DUE_D14", async () => {
    const due = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    mockedPrisma.payment.findMany.mockResolvedValueOnce([
      makePayment({ id: "p1", dueDate: due, state: "OVERDUE_D7" }),
    ]);
    mockedPrisma.payment.findUnique.mockResolvedValue({
      id: "p1",
      state: "OVERDUE_D7",
    } as never);
    mockedPrisma.payment.update.mockResolvedValue({
      id: "p1",
      state: "OVERDUE_D14",
    } as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as never);

    const r = await runOverdueEscalation({ now });
    expect(r.advanced).toBe(1);
    const codes = mockedSend.mock.calls.map((c) => c[0].templateCode);
    expect(codes).toContain("EMAIL_PAYMENT_DUE_D14");
  });

  it("advances D+30 → OVERDUE_D30 + sends SMS_PAYMENT_OVERDUE_FINAL", async () => {
    const due = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    mockedPrisma.payment.findMany.mockResolvedValueOnce([
      makePayment({ id: "p1", dueDate: due, state: "OVERDUE_D14" }),
    ]);
    mockedPrisma.payment.findUnique.mockResolvedValue({
      id: "p1",
      state: "OVERDUE_D14",
    } as never);
    mockedPrisma.payment.update.mockResolvedValue({
      id: "p1",
      state: "OVERDUE_D30",
    } as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as never);

    const r = await runOverdueEscalation({ now });
    expect(r.advanced).toBe(1);
    const codes = mockedSend.mock.calls.map((c) => c[0].templateCode);
    expect(codes).toContain("SMS_PAYMENT_OVERDUE_FINAL");
  });

  it("dedupes notifications when a log row from < 24h exists", async () => {
    const due = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    mockedPrisma.payment.findMany.mockResolvedValueOnce([
      makePayment({ id: "p1", dueDate: due, state: "EXPECTED" }),
    ]);
    mockedPrisma.payment.findUnique.mockResolvedValue({
      id: "p1",
      state: "EXPECTED",
    } as never);
    mockedPrisma.payment.update.mockResolvedValue({
      id: "p1",
      state: "OVERDUE_D7",
    } as never);
    mockedPrisma.notificationLog.findFirst.mockResolvedValue({
      id: "recent",
    } as never);

    const r = await runOverdueEscalation({ now });
    expect(r.advanced).toBe(1);
    expect(r.notificationsDeduped).toBe(1);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("does not double-advance same-tier payments", async () => {
    const due = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    mockedPrisma.payment.findMany.mockResolvedValueOnce([
      makePayment({ id: "p1", dueDate: due, state: "OVERDUE_D7" }),
    ]);
    const r = await runOverdueEscalation({ now });
    expect(r.advanced).toBe(0);
  });
});
