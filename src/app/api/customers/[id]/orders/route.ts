/**
 * GET /api/customers/[id]/orders — orders for a specific customer.
 * Optional ?productKind=EQUIPMENT|CONSUMABLE|OTHER to filter for the
 * sales-orders tab.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

const paramsSchema = z.object({ id: z.string() });
const querySchema = z.object({
  productKind: z.enum(["EQUIPMENT", "CONSUMABLE", "OTHER"]).optional(),
});

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ params, query }) => {
    const where: Record<string, unknown> = { customerId: params.id };
    if (query.productKind) {
      where.items = { some: { productKind: query.productKind } };
    }
    return prisma.order.findMany({
      where,
      include: {
        equipment: { select: { id: true, serialNumber: true } },
        items: true,
        visit: {
          select: {
            id: true,
            scheduledFor: true,
            state: true,
            type: true,
            additionalTypes: true,
            leadTechnician: { select: { id: true, username: true } },
          },
        },
      },
      orderBy: { orderedAt: "desc" },
    });
  },
});
