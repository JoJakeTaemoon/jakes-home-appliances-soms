/**
 * Customer churn quarterly report.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { customer: { findMany: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { getCustomerChurn } from "@/lib/reports/churn";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCustomerChurn", () => {
  it("queries by quarter range", async () => {
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const out = await getCustomerChurn({ year: 2026, quarter: 2 });
    expect(out.startedDate).toBe("2026-04-01");
    expect(out.endedDate).toBe("2026-07-01");
    expect(out.totalDeactivated).toBe(0);
  });

  it("sums monthly fees from non-cancelled rental/maintenance contracts", async () => {
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "c1",
        code: "KH0001",
        name: "Alice",
        type: "B2C",
        deactivatedAt: new Date("2026-05-15T00:00:00Z"),
        deactivationReason: "moved",
        contracts: [
          { monthlyMaintenanceFee: "100", type: "RENTAL" },
          { monthlyMaintenanceFee: "50", type: "MAINTENANCE" },
          { monthlyMaintenanceFee: null, type: "RENTAL" },
        ],
      },
      {
        id: "c2",
        code: "KH0002",
        name: "Bob",
        type: "B2B",
        deactivatedAt: new Date("2026-06-10T00:00:00Z"),
        deactivationReason: "moved",
        contracts: [{ monthlyMaintenanceFee: "200", type: "RENTAL" }],
      },
    ]);
    const out = await getCustomerChurn({ year: 2026, quarter: 2 });
    expect(out.totalDeactivated).toBe(2);
    expect(out.totalMonthlyValueLost).toBe(350);
    expect(out.byReason).toEqual([
      { reason: "moved", count: 2, value: 350 },
    ]);
  });

  it("buckets UNSPECIFIED when reason is null", async () => {
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "c1",
        code: "KH0001",
        name: "Alice",
        type: "B2C",
        deactivatedAt: new Date("2026-05-15T00:00:00Z"),
        deactivationReason: null,
        contracts: [],
      },
    ]);
    const out = await getCustomerChurn({ year: 2026, quarter: 2 });
    expect(out.byReason).toEqual([
      { reason: "UNSPECIFIED", count: 1, value: 0 },
    ]);
  });
});
