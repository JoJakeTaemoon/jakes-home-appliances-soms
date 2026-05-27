/**
 * Aging report bucketing unit test.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getArAging } from "@/lib/reports/aging";

function payment(
  expected: string,
  actual: string,
  dueDate: string | null,
  state: string = "EXPECTED",
) {
  return {
    id: `p-${Math.random()}`,
    expectedAmount: expected,
    actualAmount: actual,
    dueDate: dueDate ? new Date(dueDate) : null,
    state,
    customer: { id: "c1", code: "KH0001", name: "Test" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getArAging", () => {
  it("buckets by overdue days", async () => {
    const now = new Date("2026-05-27T12:00:00Z");
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      payment("100", "0", "2026-06-01T00:00:00Z"), // future → current
      payment("100", "0", "2026-05-25T00:00:00Z"), // 2 days → 1-7
      payment("100", "0", "2026-05-15T00:00:00Z"), // 12 days → 8-14
      payment("100", "0", "2026-05-01T00:00:00Z"), // 26 days → 15-30
      payment("100", "0", "2026-04-01T00:00:00Z"), // 56 days → 30+
    ]);
    const out = await getArAging(now);
    expect(out.total).toBe(500);
    expect(out.buckets.current.count).toBe(1);
    expect(out.buckets["1-7"].count).toBe(1);
    expect(out.buckets["8-14"].count).toBe(1);
    expect(out.buckets["15-30"].count).toBe(1);
    expect(out.buckets["30+"].count).toBe(1);
  });

  it("skips fully-paid rows even if state is EXPECTED", async () => {
    const now = new Date("2026-05-27T12:00:00Z");
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      payment("100", "100", "2026-04-01T00:00:00Z"),
    ]);
    const out = await getArAging(now);
    expect(out.total).toBe(0);
    expect(out.rows).toHaveLength(0);
  });

  it("only counts the outstanding portion for partials", async () => {
    const now = new Date("2026-05-27T12:00:00Z");
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      payment("100", "30", "2026-05-01T00:00:00Z"),
    ]);
    const out = await getArAging(now);
    expect(out.total).toBe(70);
    expect(out.rows[0].outstanding).toBe(70);
  });

  it("treats payments without dueDate as 'current'", async () => {
    const now = new Date("2026-05-27T12:00:00Z");
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      payment("100", "0", null),
    ]);
    const out = await getArAging(now);
    expect(out.buckets.current.count).toBe(1);
    expect(out.buckets["30+"].count).toBe(0);
  });
});
