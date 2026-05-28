import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    contract: { findMany: vi.fn() },
    payment: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { runMonthlyRecurringPayments } from "@/lib/payments/recurring";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runMonthlyRecurringPayments", () => {
  it("creates one EXPECTED row per ACTIVE rental/maintenance contract", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([
      {
        id: "co1",
        customerId: "c1",
        type: "RENTAL",
        monthlyMaintenanceFee: { toString: () => "300000" },
        equipment: [],
      },
      {
        id: "co2",
        customerId: "c2",
        type: "MAINTENANCE",
        monthlyMaintenanceFee: { toString: () => "150000" },
        equipment: [],
      },
    ] as never);
    mockedPrisma.payment.findFirst.mockResolvedValue(null);
    mockedPrisma.payment.create.mockResolvedValue({ id: "p1" } as never);

    const r = await runMonthlyRecurringPayments({ now: new Date("2026-06-01") });
    expect(r.contractsScanned).toBe(2);
    expect(r.paymentsCreated).toBe(2);
    expect(r.skippedExisting).toBe(0);
  });

  it("skips contracts that already have a payment this month (idempotent)", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([
      {
        id: "co1",
        customerId: "c1",
        type: "RENTAL",
        monthlyMaintenanceFee: { toString: () => "300000" },
        equipment: [],
      },
    ] as never);
    mockedPrisma.payment.findFirst.mockResolvedValue({ id: "existing" } as never);

    const r = await runMonthlyRecurringPayments({ now: new Date("2026-06-01") });
    expect(r.paymentsCreated).toBe(0);
    expect(r.skippedExisting).toBe(1);
  });

  it("skips contracts without a monthly fee + with no equipment-derived total", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([
      {
        id: "co1",
        customerId: "c1",
        type: "RENTAL",
        monthlyMaintenanceFee: null,
        equipment: [],
      },
    ] as never);
    const r = await runMonthlyRecurringPayments({ now: new Date("2026-06-01") });
    expect(r.skippedNoFee).toBe(1);
  });

  it("falls back to equipment unit price for rentals without a monthly fee", async () => {
    mockedPrisma.contract.findMany.mockResolvedValueOnce([
      {
        id: "co1",
        customerId: "c1",
        type: "RENTAL",
        monthlyMaintenanceFee: null,
        equipment: [
          { unitPrice: { toString: () => "200000" }, quantity: 2 },
        ],
      },
    ] as never);
    mockedPrisma.payment.findFirst.mockResolvedValue(null);
    mockedPrisma.payment.create.mockResolvedValue({ id: "p1" } as never);
    const r = await runMonthlyRecurringPayments({ now: new Date("2026-06-01") });
    expect(r.paymentsCreated).toBe(1);
    const call = mockedPrisma.payment.create.mock.calls[0][0];
    expect(call.data.expectedAmount).toBe(400_000);
  });
});
