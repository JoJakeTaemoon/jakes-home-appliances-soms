/**
 * GET /api/dashboard/summary — office dashboard widget data.
 *
 *   - Today's visits (count + by-state)
 *   - Pending payment handovers (counted, with red flag if > 48h)
 *   - This-week revenue (sum of RECONCILED actualAmount where reconciledAt in this week)
 *   - Renewals due in next 60 days (rental contracts)
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { isOfficeRole } from "@/lib/payments/access";
import { ForbiddenError } from "@/lib/api/error";

const HOUR_MS = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!isOfficeRole(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * HOUR_MS);
    const weekStart = new Date(startOfDay);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * HOUR_MS);
    const horizon60 = new Date(startOfDay.getTime() + 60 * 24 * HOUR_MS);

    const [
      todayVisits,
      pendingHandovers,
      thisWeekPayments,
      renewalsDue,
      overdueCount,
    ] = await Promise.all([
      prisma.visit.groupBy({
        by: ["state"],
        where: {
          scheduledFor: { gte: startOfDay, lt: endOfDay },
        },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where: { state: "COLLECTED", method: "CASH" },
        select: { id: true, collectedAt: true, actualAmount: true },
      }),
      prisma.payment.aggregate({
        where: {
          state: "RECONCILED",
          reconciledAt: { gte: weekStart, lt: weekEnd },
        },
        _sum: { actualAmount: true },
        _count: { _all: true },
      }),
      prisma.contract.count({
        where: {
          type: "RENTAL",
          state: "ACTIVE",
          endDate: { gte: now, lte: horizon60 },
        },
      }),
      prisma.payment.count({
        where: {
          state: { in: ["OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"] },
        },
      }),
    ]);

    const slaCutoff = new Date(now.getTime() - 48 * HOUR_MS);
    const stalePendingHandover = pendingHandovers.filter(
      (p) => p.collectedAt && p.collectedAt < slaCutoff,
    ).length;

    const visitsByState = Object.fromEntries(
      todayVisits.map((g) => [g.state, g._count._all]),
    );

    return successResponse({
      today: {
        total: todayVisits.reduce((acc, g) => acc + g._count._all, 0),
        byState: visitsByState,
      },
      pendingHandover: {
        total: pendingHandovers.length,
        stale: stalePendingHandover,
        slaHours: 48,
      },
      revenueThisWeek: {
        total: Number(thisWeekPayments._sum.actualAmount?.toString() ?? "0"),
        count: thisWeekPayments._count._all,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      },
      renewals60d: renewalsDue,
      overduePayments: overdueCount,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
