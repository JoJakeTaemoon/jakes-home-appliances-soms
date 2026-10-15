/**
 * Mocked Prisma tests for payment operations — verifies side-effects
 * (audit, notification, carryover row) without touching the DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    customer: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/notifications/send", () => ({
  sendNotification: vi.fn().mockResolvedValue([]),
}));

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import {
  applyPartialPayment,
  recordCashCollection,
  markOverdue,
  handOverCash,
} from "@/lib/payments/operations";

const mockedPrisma = vi.mocked(prisma, true);
const mockedSend = vi.mocked(sendNotification);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordCashCollection", () => {
  it("creates a COLLECTED Payment + computes carryover", async () => {
    const created = {
      id: "pay-1",
      customerId: "c1",
      method: "CASH",
      state: "COLLECTED",
      expectedAmount: { toString: () => "500000" },
      actualAmount: { toString: () => "200000" },
      carryoverAmount: { toString: () => "300000" },
    } as never;
    mockedPrisma.payment.create.mockResolvedValueOnce(created);

    const result = await recordCashCollection({
      visitId: "v1",
      customerId: "c1",
      collectedById: "u1",
      actualAmount: 200_000,
      expectedAmount: 500_000,
    });
    expect(result.paymentId).toBe("pay-1");
    expect(mockedPrisma.payment.create).toHaveBeenCalledTimes(1);
    const call = mockedPrisma.payment.create.mock.calls[0][0];
    expect(call.data.expectedAmount).toBe(500_000);
    expect(call.data.actualAmount).toBe(200_000);
    expect(call.data.carryoverAmount).toBe(300_000);
    expect(call.data.state).toBe("COLLECTED");
  });

  it("zero carryover when actual >= expected", async () => {
    mockedPrisma.payment.create.mockResolvedValueOnce({
      id: "pay-2",
      customerId: "c1",
    } as never);
    await recordCashCollection({
      visitId: "v1",
      customerId: "c1",
      collectedById: "u1",
      actualAmount: 500_000,
      expectedAmount: 500_000,
    });
    const call = mockedPrisma.payment.create.mock.calls[0][0];
    expect(call.data.carryoverAmount).toBe(0);
  });
});

describe("applyPartialPayment", () => {
  it("closes original RECONCILED + creates carryover EXPECTED row", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      customerId: "c1",
      contractId: "co1",
      method: "CASH",
      state: "EXPECTED",
      expectedAmount: { toString: () => "500000" },
      actualAmount: { toString: () => "0" },
      carryoverAmount: { toString: () => "0" },
      dueDate: new Date("2026-07-10"),
      notes: null,
    } as never);
    mockedPrisma.payment.update.mockResolvedValueOnce({ id: "pay-1" } as never);
    mockedPrisma.payment.create.mockResolvedValueOnce({ id: "pay-carry" } as never);

    const r = await applyPartialPayment({
      paymentId: "pay-1",
      partialAmount: 200_000,
      actorUserId: "u1",
    });
    expect(r.closed.id).toBe("pay-1");
    expect(r.carryover?.id).toBe("pay-carry");
    const carryCall = mockedPrisma.payment.create.mock.calls[0][0];
    expect(carryCall.data.expectedAmount).toBe(300_000);
    expect(carryCall.data.state).toBe("EXPECTED");
  });

  it("rejects partial > expected", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      expectedAmount: { toString: () => "100000" },
    } as never);
    await expect(
      applyPartialPayment({ paymentId: "pay-1", partialAmount: 500_000, actorUserId: "u1" }),
    ).rejects.toThrow();
  });
});

describe("markOverdue", () => {
  it("advances EXPECTED → OVERDUE_D7", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      state: "EXPECTED",
    } as never);
    mockedPrisma.payment.update.mockResolvedValueOnce({
      id: "pay-1",
      state: "OVERDUE_D7",
    } as never);
    const u = await markOverdue({ paymentId: "pay-1", stage: "OVERDUE_D7" });
    expect(u.state).toBe("OVERDUE_D7");
  });
});

describe("handOverCash", () => {
  it("transitions COLLECTED → HANDED_OVER + stamps handedOverAt", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      state: "COLLECTED",
    } as never);
    mockedPrisma.payment.update.mockResolvedValueOnce({
      id: "pay-1",
      state: "HANDED_OVER",
      handedOverAt: new Date(),
    } as never);
    const u = await handOverCash({ paymentId: "pay-1", handedOverById: "u1" });
    expect(u.state).toBe("HANDED_OVER");
    const call = mockedPrisma.payment.update.mock.calls[0][0];
    expect(call.data.state).toBe("HANDED_OVER");
    expect(call.data.handedOverAt).toBeInstanceOf(Date);
  });
});

describe("notification dispatch", () => {
  it("queues EMAIL_RECEIPT from recordCashCollection (when contact present)", async () => {
    mockedPrisma.payment.create.mockResolvedValueOnce({ id: "pay-1" } as never);
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      customerId: "c1",
      method: "CASH",
      collectedAt: new Date(),
      actualAmount: { toString: () => "100000" },
      customer: {
        name: "Acme",
        contacts: [
          {
            id: "ct1",
            role: "OPS_CONTACT",
            scope: "CUSTOMER",
            siteId: null,
            isPrimary: true,
          },
        ],
      },
    } as never);
    mockedSend.mockResolvedValueOnce([
      { notificationLogId: "log-1", status: "MOCKED" } as never,
    ]);
    await recordCashCollection({
      visitId: "v1",
      customerId: "c1",
      collectedById: "u1",
      actualAmount: 100_000,
    });
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: "EMAIL_RECEIPT",
        customerContactId: "ct1",
      }),
    );
  });
});

/**
 * Overdue rows used to be write-off-only on the detail page. A customer who
 * finally pays (in part or in full) must be recordable on OVERDUE_D7/14/30
 * with the same carry-over behaviour as an EXPECTED row — and a settled or
 * written-off row must never be "partially paid" a second time.
 */
describe("applyPartialPayment — which states accept it", () => {
  const row = (state: string) =>
    ({
      id: "pay-1",
      customerId: "c1",
      contractId: "co1",
      method: "BANK_TRANSFER",
      state,
      expectedAmount: { toString: () => "500000" },
      dueDate: new Date("2026-06-01"),
      notes: null,
    }) as never;

  it.each(["OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"])(
    "settles part of a %s row and carries the rest over",
    async (state) => {
      mockedPrisma.payment.findUnique.mockResolvedValueOnce(row(state));
      mockedPrisma.payment.update.mockResolvedValueOnce({ id: "pay-1" } as never);
      mockedPrisma.payment.create.mockResolvedValueOnce({ id: "pay-carry" } as never);

      const r = await applyPartialPayment({
        paymentId: "pay-1",
        partialAmount: 200_000,
        actorUserId: "u1",
      });

      expect(r.carryover?.id).toBe("pay-carry");
      const upd = mockedPrisma.payment.update.mock.calls[0][0];
      // Prior state pinned in WHERE so a concurrent write-off can't be overwritten.
      expect(upd.where).toEqual({ id: "pay-1", state });
      expect(upd.data.state).toBe("RECONCILED");
      expect(mockedPrisma.payment.create.mock.calls[0][0].data.expectedAmount).toBe(300_000);
    },
  );

  it("closes an overdue row outright when the full amount is paid", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce(row("OVERDUE_D30"));
    mockedPrisma.payment.update.mockResolvedValueOnce({ id: "pay-1" } as never);

    const r = await applyPartialPayment({
      paymentId: "pay-1",
      partialAmount: 500_000,
      actorUserId: "u1",
    });

    expect(r.carryover).toBeNull();
    expect(mockedPrisma.payment.create).not.toHaveBeenCalled();
  });

  it.each(["RECONCILED", "WRITTEN_OFF", "COLLECTED", "HANDED_OVER"])(
    "refuses a %s row and writes nothing",
    async (state) => {
      mockedPrisma.payment.findUnique.mockResolvedValueOnce(row(state));
      await expect(
        applyPartialPayment({ paymentId: "pay-1", partialAmount: 100_000, actorUserId: "u1" }),
      ).rejects.toThrow();
      expect(mockedPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockedPrisma.payment.create).not.toHaveBeenCalled();
    },
  );
});
