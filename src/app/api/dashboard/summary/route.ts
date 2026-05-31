/**
 * GET /api/dashboard/summary — office dashboard widget data.
 *
 *   - Today's visits (count + by-state)
 *   - Pending payment handovers (counted, with red flag if > 48h)
 *   - This-week revenue (sum of RECONCILED actualAmount where reconciledAt in this week)
 *   - Renewals due in next 60 days (rental contracts)
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { isOfficeRole } from "@/lib/payments/access";
import { ForbiddenError } from "@/lib/api/error";

const HOUR_MS = 60 * 60 * 1000;

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!isOfficeRole(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  handler: async () => {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * HOUR_MS);
    const weekStart = new Date(startOfDay);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * HOUR_MS);
    const horizon60 = new Date(startOfDay.getTime() + 60 * 24 * HOUR_MS);

    const [
      todayVisits,
      pendingHandovers,
      thisWeekPayments,
      renewalsDue,
      overdueCount,
      taxInvoicePending,
      openServiceRequests,
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
      // RECONCILED B2B payments where no TaxInvoice row exists yet —
      // surfaces the "office needs to upload Viettel-generated PDF" queue.
      prisma.payment.count({
        where: {
          state: "RECONCILED",
          customer: { type: "B2B" },
          taxInvoice: { is: null },
        },
      }),
      // Service requests that haven't been completed/cancelled — surfaces the
      // "still open" queue on the dashboard, ordered oldest-first.
      prisma.serviceRequest.findMany({
        where: {
          state: { in: ["PENDING_REVIEW", "APPROVED", "SCHEDULED"] },
        },
        orderBy: { submittedAt: "asc" },
        take: 5,
        select: {
          id: true,
          code: true,
          type: true,
          state: true,
          submittedAt: true,
          customer: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    const openServiceRequestsCount = await prisma.serviceRequest.count({
      where: { state: { in: ["PENDING_REVIEW", "APPROVED", "SCHEDULED"] } },
    });

    const slaCutoff = new Date(now.getTime() - 48 * HOUR_MS);
    const stalePendingHandover = pendingHandovers.filter(
      (p) => p.collectedAt && p.collectedAt < slaCutoff,
    ).length;

    const visitsByState = Object.fromEntries(
      todayVisits.map((g) => [g.state, g._count._all]),
    );

    return {
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
      taxInvoicePending,
      openServiceRequests: {
        count: openServiceRequestsCount,
        recent: openServiceRequests.map((sr) => ({
          id: sr.id,
          code: sr.code,
          type: sr.type,
          state: sr.state,
          submittedAt: sr.submittedAt.toISOString(),
          customer: sr.customer,
        })),
      },
    };
  },
});
