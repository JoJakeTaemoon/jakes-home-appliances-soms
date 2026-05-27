/**
 * Accounts-receivable aging report (UC-RP-04).
 *
 * Buckets every payment that hasn't been fully collected (state in EXPECTED /
 * OVERDUE_D*) by how long past `dueDate` it is. Bucket cut-offs:
 *
 *   current   — dueDate is today or in the future (or dueDate is null)
 *   1-7       — overdue 1 to 7 days
 *   8-14      — overdue 8 to 14 days
 *   15-30     — overdue 15 to 30 days
 *   30+       — overdue more than 30 days
 *
 * Returns per-bucket total + count + per-customer drill-down list.
 */

import prisma from "@/lib/prisma";

export type AgingBucket = "current" | "1-7" | "8-14" | "15-30" | "30+";

export interface AgingRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  paymentId: string;
  expectedAmount: number;
  actualAmount: number;
  outstanding: number;
  dueDate: string | null;
  daysOverdue: number;
  bucket: AgingBucket;
}

export interface AgingReport {
  asOf: string;
  buckets: Record<AgingBucket, { count: number; total: number }>;
  rows: AgingRow[];
  total: number;
}

function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 7) return "1-7";
  if (daysOverdue <= 14) return "8-14";
  if (daysOverdue <= 30) return "15-30";
  return "30+";
}

export async function getArAging(asOf: Date = new Date()): Promise<AgingReport> {
  const payments = await prisma.payment.findMany({
    where: {
      state: { in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"] },
    },
    select: {
      id: true,
      expectedAmount: true,
      actualAmount: true,
      dueDate: true,
      customer: { select: { id: true, code: true, name: true } },
    },
  });

  const buckets: AgingReport["buckets"] = {
    current: { count: 0, total: 0 },
    "1-7": { count: 0, total: 0 },
    "8-14": { count: 0, total: 0 },
    "15-30": { count: 0, total: 0 },
    "30+": { count: 0, total: 0 },
  };
  const rows: AgingRow[] = [];
  let total = 0;
  const now = asOf.getTime();
  for (const p of payments) {
    const expected = Number(p.expectedAmount.toString());
    const actual = Number(p.actualAmount.toString());
    const outstanding = Math.max(0, expected - actual);
    if (outstanding <= 0) continue;
    const dueMs = p.dueDate ? p.dueDate.getTime() : null;
    const daysOverdue =
      dueMs !== null
        ? Math.floor((now - dueMs) / (24 * 60 * 60 * 1000))
        : 0;
    const bucket = bucketFor(daysOverdue);
    buckets[bucket].count += 1;
    buckets[bucket].total += outstanding;
    total += outstanding;
    rows.push({
      customerId: p.customer.id,
      customerCode: p.customer.code,
      customerName: p.customer.name,
      paymentId: p.id,
      expectedAmount: expected,
      actualAmount: actual,
      outstanding,
      dueDate: p.dueDate?.toISOString() ?? null,
      daysOverdue: Math.max(0, daysOverdue),
      bucket,
    });
  }
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return {
    asOf: asOf.toISOString(),
    buckets,
    rows,
    total,
  };
}
