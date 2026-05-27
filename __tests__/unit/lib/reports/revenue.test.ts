/**
 * Revenue report unit test — mocks @/lib/prisma so we can drive payment rows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getMonthlyRevenue } from "@/lib/reports/revenue";

function row(amount: string, dt: string, type: string | null) {
  return {
    actualAmount: amount,
    collectedAt: new Date(dt),
    contract: type ? { type } : null,
    visit: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMonthlyRevenue", () => {
  it("returns 12 monthly buckets terminating at the requested month", async () => {
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const out = await getMonthlyRevenue({ year: 2026, month: 5 });
    expect(out.byMonth).toHaveLength(12);
    expect(out.byMonth[11]).toMatchObject({ year: 2026, month: 5 });
    expect(out.byMonth[0]).toMatchObject({ year: 2025, month: 6 });
  });

  it("buckets by contract type and falls through to SERVICE_REQUEST_FEE when no contract", async () => {
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      row("100", "2026-05-05T00:00:00Z", "SALE"),
      row("200", "2026-05-15T00:00:00Z", "RENTAL"),
      row("50", "2026-05-20T00:00:00Z", null),
    ]);
    const out = await getMonthlyRevenue({ year: 2026, month: 5 });
    expect(out.total).toBe(350);
    expect(out.byType.SALE).toBe(100);
    expect(out.byType.RENTAL).toBe(200);
    expect(out.byType.SERVICE_REQUEST_FEE).toBe(50);
    expect(out.byType.MAINTENANCE).toBe(0);
  });

  it("ignores payments outside the 12-month window", async () => {
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      row("100", "2025-04-05T00:00:00Z", "SALE"), // before window
      row("100", "2026-05-05T00:00:00Z", "SALE"), // in window
    ]);
    const out = await getMonthlyRevenue({ year: 2026, month: 5 });
    expect(out.total).toBe(100);
  });

  it("skips non-positive amounts", async () => {
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      row("0", "2026-05-05T00:00:00Z", "SALE"),
      row("-50", "2026-05-05T00:00:00Z", "SALE"),
      row("100", "2026-05-05T00:00:00Z", "SALE"),
    ]);
    const out = await getMonthlyRevenue({ year: 2026, month: 5 });
    expect(out.total).toBe(100);
  });
});
