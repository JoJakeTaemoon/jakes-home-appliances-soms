/**
 * GET /api/portal/service-requests/[id] — fetch a single SR.
 *
 * Scope: customer-owned only. Site-scoped OPS contacts cannot see SRs whose
 * equipment lives in a different site.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { NotFoundError } from "@/lib/api/error";
import { canViewEquipmentAtSite } from "@/lib/auth/customer-access";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "customer",
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
      include: {
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            siteId: true,
            installedAt: true,
            model: { select: { modelCode: true, name: true } },
            site: { select: { id: true, name: true } },
          },
        },
        visit: {
          select: {
            id: true,
            state: true,
            scheduledFor: true,
            scheduledWindow: true,
            leadTechnician: { select: { id: true, username: true, phone: true } },
          },
        },
        contact: { select: { id: true, name: true } },
      },
    });
    if (!sr || sr.customerId !== auth.customerId) {
      throw new NotFoundError("Service request not found");
    }
    if (sr.equipment) {
      const allowed = canViewEquipmentAtSite(
        {
          contactId: auth.contactId,
          customerId: auth.customerId,
          role: auth.role,
          scope: auth.scope,
          siteId: auth.siteId,
        },
        sr.equipment.siteId,
      );
      if (!allowed) throw new NotFoundError("Service request not found");
    }
    return sr;
  },
});
