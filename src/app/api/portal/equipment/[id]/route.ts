/**
 * GET /api/portal/equipment/[id] — single equipment detail (UC-PT-02).
 *
 * Enforces customer + site scope. Returns model + filter policy + last/next
 * visit hints when available (Phase 4 will populate visit rows; right now
 * these are placeholders).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { canViewEquipmentAtSite } from "@/lib/auth/customer-access";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const caller = await requireCustomerAuth(request);
    const { id } = await ctx.params;

    const eq = await prisma.equipment.findFirst({
      where: { id, customerId: caller.customerId },
      include: {
        model: true,
        site: { select: { id: true, name: true, address: true } },
      },
    });
    if (!eq) throw new NotFoundError("Equipment not found");

    if (
      !canViewEquipmentAtSite(
        {
          contactId: caller.contactId,
          customerId: caller.customerId,
          role: caller.role,
          scope: caller.scope,
          siteId: caller.siteId,
        },
        eq.siteId,
      )
    ) {
      throw new ForbiddenError("Out of your site scope");
    }

    return successResponse({ equipment: eq });
  } catch (err) {
    return toErrorResponse(err);
  }
}
