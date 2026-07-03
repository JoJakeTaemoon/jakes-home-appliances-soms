/**
 * GET /api/sales-reps/[id] — single sales rep + roster/finance summary.
 *
 * `last30dRevenue` = money collected in the last 30 days for this rep's
 * customers: RENTAL_FEE + SALE_PAYMENT payments (COLLECTED/HANDED_OVER/
 * RECONCILED) plus paid CONSUMABLE order items. Deposits, refunds, and
 * maintenance/service fees are excluded (matches the /api/sales-reps
 * list card definition; see that file for the "why").
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    const rep = await prisma.user.findFirst({
      where: {
        id: params.id,
        role: { in: ["ADMIN", "MANAGER", "STAFF"] },
      },
      select: {
        id: true,
        username: true,
        title: true,
        avatarUrl: true,
        role: true,
        email: true,
        phone: true,
        isSalesRep: true,
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
