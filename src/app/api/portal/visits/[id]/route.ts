/**
 * GET /api/portal/visits/[id] — visit detail for the customer.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "customer",
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const visit = await prisma.visit.findUnique({
      where: { id: params.id },
      include: {
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: { select: { name: true, modelCode: true } },
          },
        },
        leadTechnician: { select: { id: true, username: true } },
        documents: {
          orderBy: { generatedAt: "desc" },
          select: {
            id: true,
            kind: true,
            templateCode: true,
            filename: true,
            storageKey: true,
            generatedAt: true,
          },
        },
      },
    });
    if (!visit || visit.customerId !== auth.customerId) {
      throw new NotFoundError("Visit not found");
    }
    if (auth.scope === "SITE" && auth.siteId && visit.siteId !== auth.siteId) {
      throw new NotFoundError("Visit not found");
    }
    return visit;
  },
});
