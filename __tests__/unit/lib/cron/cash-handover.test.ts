import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: { findMany: vi.fn() },
    auditLog: { findFirst: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { runCashHandoverAlert } from "@/lib/cron/cash-handover-alert";

const mockedPrisma = vi.mocked(prisma, true);
const mockedLogAudit = vi.mocked(logAudit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runCashHandoverAlert", () => {
  const now = new Date("2026-06-15T18:30:00Z");

  it("flags payments collected > 48h ago", async () => {
    mockedPrisma.payment.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        collectedAt: new Date(now.getTime() - 60 * 60 * 60 * 1000),
        actualAmount: { toString: () => "300000" },
        collectedById: "u1",
        customerId: "c1",
      },
    ] as never);
    mockedPrisma.auditLog.findFirst.mockResolvedValue(null);
    const r = await runCashHandoverAlert({ now });
    expect(r.flagged).toBe(1);
    expect(mockedLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYMENT_HANDOVER_SLA_BREACH",
        entityType: "Payment",
        entityId: "p1",
      }),
    );
  });

  it("dedupes within 24h", async () => {
    mockedPrisma.payment.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        collectedAt: new Date(now.getTime() - 60 * 60 * 60 * 1000),
        actualAmount: { toString: () => "300000" },
        collectedById: "u1",
        customerId: "c1",
      },
    ] as never);
    mockedPrisma.auditLog.findFirst.mockResolvedValue({ id: "recent" } as never);
    const r = await runCashHandoverAlert({ now });
    expect(r.deduped).toBe(1);
    expect(r.flagged).toBe(0);
  });
});
