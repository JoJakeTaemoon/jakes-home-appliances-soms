/**
 * GET /api/sales-reps/[id] — single sales rep + aggregates over the
 * current month (assigned customers, new contracts, receivables).
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

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [customerCount, monthlyContracts, payments] = await Promise.all([
      prisma.customer.count({ where: { salesRepId: params.id } }),
      // Equipment-centric aggregation (2026-07-02): "monthlyContracts"
      // now counts this-month new equipment for the rep's customers.
      // The field name is preserved for markup back-compat with the
      // rep-detail KPI card.
      prisma.equipment.count({
        where: {
          customer: { salesRepId: params.id },
          status: { not: "REPLACED" },
          installedAt: { gte: monthStart },
        },
      }),
      prisma.payment.findMany({
        where: {
          customer: { salesRepId: params.id },
          state: { in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"] },
        },
        select: { expectedAmount: true, actualAmount: true },
      }),
    ]);

    let receivables = 0;
    for (const p of payments) {
      receivables += Math.max(
        0,
        Number(p.expectedAmount ?? 0) - Number(p.actualAmount ?? 0),
      );
    }

    return {
      ...rep,
      stats: {
        customerCount,
        monthlyContracts,
        receivables,
      },
    };
  },
});
