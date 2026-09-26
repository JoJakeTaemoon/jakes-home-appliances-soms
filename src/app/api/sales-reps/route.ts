/**
 * GET  /api/sales-reps — the 판매원 roster. Used by:
 *   - the customer-list sidebar filter (Combobox)
 *   - the 담당 판매원 picker on the customer form
 *   - the change-sales-rep modal in customer-detail
 *   - the sales-rep landing page (/o/sales-reps)
 * POST /api/sales-reps — add a rep (STAFF+, so the picker's inline "+ 추가"
 *   works for whoever is entering the customer).
 *
 * Policy (2026-09-25): a rep is a row in `SalesRep`, not a `User`. Most reps
 * never log in, and hanging the roster off office accounts put every staff
 * member in the picker whether they sell or not. Deactivated reps stay out of
 * the list but keep naming who sold a past customer.
 *
 * Each row carries a `stats` block (counts + 30-day revenue + receivables)
 * so the landing page can render numeric cards without N round-trips.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { createSalesRepSchema } from "@/lib/validators/salesRep";
import { ForbiddenError } from "@/lib/api/error";
import { isOfficeRole } from "@/lib/auth/roles";
import { z } from "zod";

export const GET = defineQuery({
  audience: "staff",
  authorize: () => {
    /* All staff can read the sales-rep roster (used in filters). */
  },
  query: z.object({
    /** `true` also returns deactivated reps — the roster screen wants them. */
    includeInactive: z.coerce.boolean().optional(),
  }),
  handler: async ({ query }) => {
    const reps = await prisma.salesRep.findMany({
      where: query.includeInactive ? {} : { isActive: true },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        title: true,
        notes: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });
    if (reps.length === 0) return [];

    const repIds = reps.map((r) => r.id);

    // Fixed 30-day window ending "now" — the sales-reps list card shows
    // "지난 30일 매출" (2026-07-03 policy). Revenue == money that came in:
    // Payment.actualAmount for RENTAL_FEE + SALE_PAYMENT collected in the
    // window, plus paid consumable OrderItem totals for orders placed in
    // the window. Deposits, refunds, maintenance, and ad-hoc service fees
    // are excluded per the "임대료 및 구매금액" spec.
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── Customer count per rep ──
    const customerGroups = await prisma.customer.groupBy({
      by: ["salesRepId"],
      where: { salesRepId: { in: repIds } },
      _count: { _all: true },
    });
    const customersByRep = new Map<string, number>();
    for (const g of customerGroups) {
      if (g.salesRepId) customersByRep.set(g.salesRepId, g._count._all);
    }

    // ── Past-30d revenue per rep ──
    const [collectedPayments, paidOrderItems] = await Promise.all([
      prisma.payment.findMany({
        where: {
          customer: { salesRepId: { in: repIds } },
          kind: { in: ["RENTAL_FEE", "SALE_PAYMENT"] },
          state: { in: ["COLLECTED", "HANDED_OVER", "RECONCILED"] },
          collectedAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
          actualAmount: true,
          customer: { select: { salesRepId: true } },
        },
      }),
      prisma.orderItem.findMany({
        where: {
          productKind: "CONSUMABLE",
          unitPrice: { gt: 0 },
          order: {
            state: { not: "CANCELLED" },
            orderedAt: { gte: windowStart, lte: windowEnd },
            customer: { salesRepId: { in: repIds } },
          },
        },
        select: {
          totalPrice: true,
          order: {
            select: { customer: { select: { salesRepId: true } } },
          },
        },
      }),
    ]);
    const last30dRevenueByRep = new Map<string, number>();
    for (const p of collectedPayments) {
      const repId = p.customer.salesRepId;
      if (!repId) continue;
      last30dRevenueByRep.set(
        repId,
        (last30dRevenueByRep.get(repId) ?? 0) + Number(p.actualAmount ?? 0),
      );
    }
    for (const item of paidOrderItems) {
      const repId = item.order.customer.salesRepId;
      if (!repId) continue;
      last30dRevenueByRep.set(
        repId,
        (last30dRevenueByRep.get(repId) ?? 0) + Number(item.totalPrice ?? 0),
      );
    }

    // ── Outstanding receivables per rep ──
    const payments = await prisma.payment.findMany({
      where: {
        state: { in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"] },
        customer: { salesRepId: { in: repIds } },
      },
      select: {
        expectedAmount: true,
        actualAmount: true,
        customer: { select: { salesRepId: true } },
      },
    });
    const receivablesByRep = new Map<string, number>();
    for (const p of payments) {
      const repId = p.customer.salesRepId;
      if (!repId) continue;
      const outstanding = Math.max(
        0,
        Number(p.expectedAmount ?? 0) - Number(p.actualAmount ?? 0),
      );
      receivablesByRep.set(
        repId,
        (receivablesByRep.get(repId) ?? 0) + outstanding,
      );
    }

    return reps.map((r) => ({
      ...r,
      stats: {
        customerCount: customersByRep.get(r.id) ?? 0,
        last30dRevenue: last30dRevenueByRep.get(r.id) ?? 0,
        receivables: receivablesByRep.get(r.id) ?? 0,
      },
    }));
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    // Any office role — whoever registers the customer may need to add the
    // rep in the same breath. Editing and retiring are MANAGER+ (see [id]).
    if (!isOfficeRole(auth.role)) throw new ForbiddenError("Office role required");
  },
  body: createSalesRepSchema,
  successStatus: 201,
  handler: async ({ body }) =>
    prisma.salesRep.create({
      data: {
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        title: body.title ?? null,
        notes: body.notes ?? null,
      },
    }),
  audit: {
    action: "SALES_REP_CREATE",
    entityType: "SalesRep",
    after: (r) => r,
  },
});
