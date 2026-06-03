/**
 * GET /api/portal/equipment/[id] — single equipment detail (UC-PT-02).
 *
 * Enforces customer + site scope. Returns model + filter policy + last/next
 * visit hints when available (Phase 4 will populate visit rows; right now
 * these are placeholders).
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canViewEquipmentAtSite } from "@/lib/auth/customer-access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "customer",
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const eq = await prisma.equipment.findFirst({
      where: { id: params.id, customerId: auth.customerId },
      include: {
        model: true,
        site: { select: { id: true, name: true, address: true } },
      },
    });
    if (!eq) throw new NotFoundError("Equipment not found");

    if (
      !canViewEquipmentAtSite(
        {
          contactId: auth.contactId,
          customerId: auth.customerId,
          role: auth.role,
          scope: auth.scope,
          siteId: auth.siteId,
        },
        eq.siteId,
      )
    ) {
      throw new ForbiddenError("Out of your site scope");
    }

    // Visit history for this equipment. We intentionally exclude
    // technician-only fields (officeNotes is a relay channel between
    // the technician and HQ that the customer must never see) and
    // raw signature photo URL. We DO show findings — that mirrors
    // what's already on the customer's signed work-confirmation PDF.
    const visits = await prisma.visit.findMany({
      where: { equipmentId: eq.id, customerId: auth.customerId },
      orderBy: [{ scheduledFor: "desc" }],
      take: 200,
      select: {
        id: true,
        type: true,
        state: true,
        scheduledFor: true,
        completedAt: true,
        findings: true,
        consumableLogs: {
          select: {
            action: true,
            consumable: {
              select: {
                id: true,
                sku: true,
                nameKo: true,
                nameVi: true,
                nameEn: true,
              },
            },
          },
        },
      },
    });

    return { equipment: eq, visits };
  },
});
