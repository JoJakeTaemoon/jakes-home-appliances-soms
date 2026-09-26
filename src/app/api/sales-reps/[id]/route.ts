/**
 * GET    /api/sales-reps/[id] — single sales rep + roster/finance summary.
 * PATCH  /api/sales-reps/[id] — edit the rep (MANAGER+).
 * DELETE /api/sales-reps/[id] — retire the rep (MANAGER+, soft: isActive=false).
 *
 * Retiring rather than deleting: customers keep naming who sold them, and the
 * FK is `onDelete: SetNull`, so a hard delete would silently blank that.
 *
 * `last30dRevenue` = money collected in the last 30 days for this rep's
 * customers: RENTAL_FEE + SALE_PAYMENT payments (COLLECTED/HANDED_OVER/
 * RECONCILED) plus paid CONSUMABLE order items. Deposits, refunds, and
 * maintenance/service fees are excluded (matches the /api/sales-reps
 * list card definition; see that file for the "why").
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { updateSalesRepSchema } from "@/lib/validators/salesRep";
import { canApproveOps } from "@/lib/auth/roles";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    const rep = await prisma.salesRep.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        phone: true,
        notes: true,
        isActive: true,
      },
    });
    if (!rep) throw new NotFoundError("Sales rep not found");

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [customerCount, collectedPayments, paidOrderItems, receivablePayments] =
      await Promise.all([
        prisma.customer.count({ where: { salesRepId: params.id } }),
        prisma.payment.findMany({
          where: {
            customer: { salesRepId: params.id },
            kind: { in: ["RENTAL_FEE", "SALE_PAYMENT"] },
            state: { in: ["COLLECTED", "HANDED_OVER", "RECONCILED"] },
            collectedAt: { gte: windowStart, lte: windowEnd },
          },
          select: { actualAmount: true },
        }),
        prisma.orderItem.findMany({
          where: {
            productKind: "CONSUMABLE",
            unitPrice: { gt: 0 },
            order: {
              state: { not: "CANCELLED" },
              orderedAt: { gte: windowStart, lte: windowEnd },
              customer: { salesRepId: params.id },
            },
          },
          select: { totalPrice: true },
        }),
        prisma.payment.findMany({
          where: {
            customer: { salesRepId: params.id },
            state: {
              in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"],
            },
          },
          select: { expectedAmount: true, actualAmount: true },
        }),
      ]);

    let last30dRevenue = 0;
    for (const p of collectedPayments) last30dRevenue += Number(p.actualAmount ?? 0);
    for (const item of paidOrderItems) last30dRevenue += Number(item.totalPrice ?? 0);

    let receivables = 0;
    for (const p of receivablePayments) {
      receivables += Math.max(
        0,
        Number(p.expectedAmount ?? 0) - Number(p.actualAmount ?? 0),
      );
    }

    return {
      ...rep,
      stats: {
        customerCount,
        last30dRevenue,
        receivables,
      },
    };
  },
});

function requireManager(role: string): void {
  if (!canApproveOps(role)) throw new ForbiddenError("MANAGER+ required");
}

export const PATCH = defineMutation({
  audience: "staff",
  params: paramsSchema,
  authorize: (auth) => requireManager(auth.role),
  body: updateSalesRepSchema,
  handler: async ({ params, body }) => {
    const exists = await prisma.salesRep.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError("Sales rep not found");
    return prisma.salesRep.update({ where: { id: params.id }, data: body });
  },
  audit: {
    action: "SALES_REP_UPDATE",
    entityType: "SalesRep",
    after: (r) => r,
  },
});

export const DELETE = defineMutation({
  audience: "staff",
  params: paramsSchema,
  authorize: (auth) => requireManager(auth.role),
  handler: async ({ params }) => {
    const rep = await prisma.salesRep.findUnique({
      where: { id: params.id },
      select: { id: true, isActive: true },
    });
    if (!rep) throw new NotFoundError("Sales rep not found");
    // Customers keep pointing at a retired rep — the roster hides it, the
    // history does not.
    await prisma.salesRep.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    return { id: params.id, isActive: false };
  },
  audit: {
    action: "SALES_REP_DEACTIVATE",
    entityType: "SalesRep",
    after: (r) => r,
  },
});
