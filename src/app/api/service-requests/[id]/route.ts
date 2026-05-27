/**
 * GET /api/service-requests/[id] — office detail view.
 *
 * Returns the SR with customer, equipment, attachments JSON, contact,
 * linked visit (if any), and recent activity (AuditLog entries scoped to
 * this SR).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { isOfficeRole } from "@/lib/visits/access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
    const { id } = await params;

    const sr = await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            address: true,
            district: true,
            city: true,
          },
        },
        contact: { select: { id: true, name: true, phone1: true, role: true } },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            installedAt: true,
            siteId: true,
            model: { select: { modelCode: true, name: true, category: true } },
            site: { select: { id: true, name: true } },
            contracts: {
              select: {
                contract: {
                  select: { id: true, contractNumber: true, type: true, state: true },
                },
              },
            },
          },
        },
        visit: {
          select: {
            id: true,
            state: true,
            type: true,
            scheduledFor: true,
            scheduledWindow: true,
            leadTechnician: { select: { id: true, username: true, phone: true } },
            collaboratorTechnicianIds: true,
          },
        },
      },
    });
    if (!sr) throw new NotFoundError("Service request not found");

    const activity = await prisma.auditLog.findMany({
      where: { entityType: "ServiceRequest", entityId: id },
      orderBy: { at: "desc" },
      take: 30,
      select: {
        id: true,
        action: true,
        actorType: true,
        actorId: true,
        at: true,
        before: true,
        after: true,
      },
    });

    return successResponse({ ...sr, activity });
  } catch (err) {
    return toErrorResponse(err);
  }
}
