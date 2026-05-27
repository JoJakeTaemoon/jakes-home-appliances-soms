/**
 * GET /api/portal/visits — UC-PT-03. Visit history for the logged-in customer.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

export const GET = defineQuery({
  audience: "customer",
  handler: async ({ auth }) => {
    const where: Record<string, unknown> = { customerId: auth.customerId };
    // SITE-scoped OPS contacts only see their own site
    if (auth.scope === "SITE" && auth.siteId) {
      where.siteId = auth.siteId;
    }
    return prisma.visit.findMany({
      where,
      orderBy: [{ scheduledFor: "desc" }],
      take: 100,
      include: {
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: { select: { name: true, modelCode: true } },
          },
        },
        leadTechnician: { select: { id: true, username: true } },
      },
    });
  },
});
