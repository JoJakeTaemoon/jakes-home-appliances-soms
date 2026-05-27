/**
 * Customer churn report (UC-RP-05).
 *
 * Lists every Customer whose `deactivatedAt` falls in the requested quarter,
 * along with reason + active-contract value at the time of deactivation
 * (best-effort: sum of monthly fees on terminated rentals / maintenance
 * contracts attached to the customer).
 */

import prisma from "@/lib/prisma";

export interface ChurnRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  type: "B2C" | "B2B";
  deactivatedAt: string;
  reason: string | null;
  monthlyValueLost: number;
}

export interface ChurnReport {
  year: number;
  quarter: number; // 1-4
  startedDate: string;
  endedDate: string;
  totalDeactivated: number;
  totalMonthlyValueLost: number;
  rows: ChurnRow[];
  byReason: Array<{ reason: string; count: number; value: number }>;
}

function quarterRange(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3; // 0,3,6,9
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start, end };
}

export async function getCustomerChurn(input: {
  year: number;
  quarter: number;
}): Promise<ChurnReport> {
  const { start, end } = quarterRange(input.year, input.quarter);
  const customers = await prisma.customer.findMany({
    where: {
      deactivatedAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      deactivatedAt: true,
      deactivationReason: true,
      contracts: {
        where: {
          state: { in: ["TERMINATED", "AMENDED", "COMPLETED", "ACTIVE"] },
          type: { in: ["RENTAL", "MAINTENANCE"] },
        },
        select: { monthlyMaintenanceFee: true, type: true },
      },
    },
  });
  const rows: ChurnRow[] = [];
  const byReason = new Map<string, { count: number; value: number }>();
  let totalValue = 0;
  for (const c of customers) {
    if (!c.deactivatedAt) continue;
    const monthlyValue = c.contracts.reduce((acc, k) => {
      const v = k.monthlyMaintenanceFee
        ? Number(k.monthlyMaintenanceFee.toString())
        : 0;
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
    totalValue += monthlyValue;
    const reasonKey = c.deactivationReason ?? "UNSPECIFIED";
    const r = byReason.get(reasonKey) ?? { count: 0, value: 0 };
    r.count += 1;
    r.value += monthlyValue;
    byReason.set(reasonKey, r);
    rows.push({
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      type: c.type as "B2C" | "B2B",
      deactivatedAt: c.deactivatedAt.toISOString(),
      reason: c.deactivationReason ?? null,
      monthlyValueLost: monthlyValue,
    });
  }
  rows.sort(
    (a, b) =>
      new Date(b.deactivatedAt).getTime() -
      new Date(a.deactivatedAt).getTime(),
  );
  return {
    year: input.year,
    quarter: input.quarter,
    startedDate: start.toISOString().slice(0, 10),
    endedDate: end.toISOString().slice(0, 10),
    totalDeactivated: rows.length,
    totalMonthlyValueLost: totalValue,
    rows,
    byReason: [...byReason.entries()]
      .map(([reason, v]) => ({ reason, count: v.count, value: v.value }))
      .sort((a, b) => b.count - a.count),
  };
}
