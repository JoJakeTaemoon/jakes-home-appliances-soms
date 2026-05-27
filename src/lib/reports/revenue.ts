/**
 * Monthly revenue report (UC-RP-02).
 *
 * "Revenue" = sum of `Payment.actualAmount` for payments whose state is
 * RECONCILED or HANDED_OVER (post-collection but pre-reconciliation we still
 * count as recognized cash). Group by month derived from `collectedAt`, then
 * sub-group by the originating contract type when available; payments without
 * a contract (e.g. paid service requests) bucket into SERVICE_REQUEST_FEE.
 *
 * Returns the requested month total + breakdown plus the trailing 12-month
 * series so the UI can render a line chart in one round trip.
 */

import prisma from "@/lib/prisma";

export type RevenueBucket =
  | "SALE"
  | "RENTAL"
  | "MAINTENANCE"
  | "SERVICE_REQUEST_FEE";

export interface RevenueReport {
  year: number;
  month: number; // 1-12
  total: number;
  byType: Record<RevenueBucket, number>;
  byMonth: Array<{
    year: number;
    month: number;
    total: number;
    byType: Record<RevenueBucket, number>;
  }>;
}

function emptyBuckets(): Record<RevenueBucket, number> {
  return { SALE: 0, RENTAL: 0, MAINTENANCE: 0, SERVICE_REQUEST_FEE: 0 };
}

function bucketFor(contractType: string | null): RevenueBucket {
  if (contractType === "SALE") return "SALE";
  if (contractType === "RENTAL") return "RENTAL";
  if (contractType === "MAINTENANCE") return "MAINTENANCE";
  return "SERVICE_REQUEST_FEE";
}

export async function getMonthlyRevenue(input: {
  year: number;
  month: number; // 1-12
}): Promise<RevenueReport> {
  // Trailing 12-month window ending at the requested month.
  const endY = input.year;
  const endM = input.month;
  // Compute window start = 11 months before endY/endM
  let startY = endY;
  let startM = endM - 11;
  while (startM <= 0) {
    startM += 12;
    startY -= 1;
  }
  const start = new Date(Date.UTC(startY, startM - 1, 1));
  const end = new Date(Date.UTC(endY, endM, 1)); // exclusive

  const payments = await prisma.payment.findMany({
    where: {
      state: { in: ["RECONCILED", "HANDED_OVER", "COLLECTED"] },
      collectedAt: { gte: start, lt: end },
    },
    select: {
      actualAmount: true,
      collectedAt: true,
      contract: { select: { type: true } },
      visit: { select: { serviceRequestId: true } },
    },
  });

  // Pre-fill 12 month buckets in chronological order
  const series: RevenueReport["byMonth"] = [];
  for (let i = 0; i < 12; i++) {
    let y = startY;
    let m = startM + i;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    series.push({ year: y, month: m, total: 0, byType: emptyBuckets() });
  }
  const indexOf = (y: number, m: number) =>
    (y - startY) * 12 + (m - startM);

  for (const p of payments) {
    if (!p.collectedAt) continue;
    const amt = Number(p.actualAmount.toString());
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const y = p.collectedAt.getUTCFullYear();
    const m = p.collectedAt.getUTCMonth() + 1;
    const idx = indexOf(y, m);
    if (idx < 0 || idx >= series.length) continue;
    const bucket: RevenueBucket = bucketFor(p.contract?.type ?? null);
    series[idx].total += amt;
    series[idx].byType[bucket] += amt;
  }

  const currentIdx = indexOf(endY, endM);
  const current = series[currentIdx];
  return {
    year: input.year,
    month: input.month,
    total: current.total,
    byType: current.byType,
    byMonth: series,
  };
}
