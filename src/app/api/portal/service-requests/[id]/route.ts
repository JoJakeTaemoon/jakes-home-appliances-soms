/**
 * GET /api/portal/service-requests/[id] — fetch a single SR.
 *
 * Scope: customer-owned only. Site-scoped OPS contacts cannot see SRs whose
 * equipment lives in a different site.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { NotFoundError } from "@/lib/api/error";
import { canViewEquipmentAtSite } from "@/lib/auth/customer-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireCustomerAuth(request);
    const { id } = await params;

    const sr = await prisma.serviceRequest.findUnique({
      where: { id },
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
    if (!sr || sr.customerId !== caller.customerId) {
      throw new NotFoundError("Service request not found");
    }
    if (sr.equipment) {
      const allowed = canViewEquipmentAtSite(
        {
          contactId: caller.contactId,
          customerId: caller.customerId,
          role: caller.role,
          scope: caller.scope,
          siteId: caller.siteId,
        },
        sr.equipment.siteId,
      );
      if (!allowed) throw new NotFoundError("Service request not found");
    }

    return successResponse(sr);
  } catch (err) {
    return toErrorResponse(err);
  }
}
