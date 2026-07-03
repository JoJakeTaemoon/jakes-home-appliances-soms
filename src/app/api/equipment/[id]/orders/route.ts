/**
 * GET /api/equipment/[id]/orders — orders that target this specific equipment.
 * Used by the purchase-history widget on the equipment master-detail panel.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    return prisma.order.findMany({
      where: { equipmentId: params.id },
      include: {
        items: {
          select: { customName: true, quantity: true, totalPrice: true },
        },
      },
      orderBy: { orderedAt: "desc" },
      take: 10,
    });
  },
});
