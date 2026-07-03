/**
 * GET /api/customers/[id]/upcoming-visit
 *
 * Returns the customer's closest upcoming SUGGESTED/SCHEDULED visit
 * (scheduledFor >= today, ascending). Powers the "attach consumable
 * order to an existing visit" flow in the order-create modal — the
 * office sees the next planned trip and decides whether to piggy-back
 * on it or roll a fresh delivery visit.
 *
 * Returns `null` when the customer has no upcoming visits.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const visit = await prisma.visit.findFirst({
      where: {
        customerId: params.id,
        state: { in: ["SUGGESTED", "SCHEDULED"] },
        scheduledFor: { gte: today },
      },
      orderBy: { scheduledFor: "asc" },
      select: {
        id: true,
        type: true,
        additionalTypes: true,
        state: true,
        scheduledFor: true,
        leadTechnician: { select: { id: true, username: true } },
        site: { select: { id: true, name: true } },
      },
    });
    return visit;
  },
});
