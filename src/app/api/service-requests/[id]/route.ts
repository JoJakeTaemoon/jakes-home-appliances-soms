/**
 * GET /api/service-requests/[id] — office detail view.
 *
 * Returns the SR with customer, equipment, attachments JSON, contact,
 * linked visit (if any), and recent activity (AuditLog entries scoped to
 * this SR).
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!ServiceRequestWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
  },
  params: paramsSchema,
  handler: async ({ params }) => {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
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
            // Office needs the OPS contact phone to call the customer if
            // the proposed visit time doesn't fit. Sort so the primary
            // OPS bubbles up first in the office UI.
            contacts: {
              where: { role: "OPS_CONTACT" },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: {
                id: true,
                name: true,
                phone1: true,
                role: true,
                scope: true,
                isPrimary: true,
              },
            },
          },
        },
        contact: { select: { id: true, name: true, phone1: true, role: true } },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            installedAt: true,
            siteId: true,
            model: { select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true, category: true } },
            site: { select: { id: true, name: true } },
            contracts: {
              select: {
                contract: {
                  select: {
                    id: true,
                    contractNumber: true,
                    type: true,
                    state: true,
                  },
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
            leadTechnician: {
              select: { id: true, username: true, phone: true },
            },
            collaboratorTechnicianIds: true,
          },
        },
      },
    });
    if (!sr) throw new NotFoundError("Service request not found");

    const activity = await prisma.auditLog.findMany({
      where: { entityType: "ServiceRequest", entityId: params.id },
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

    // Did a customer message arrive after the office team last read?
    // Drives the "읽음" button visibility on the detail page.
    const lastCustomerMsg = await prisma.auditLog.findFirst({
      where: {
        action: "SR_MESSAGE",
        actorType: "CUSTOMER",
        entityType: "ServiceRequest",
        entityId: params.id,
      },
      orderBy: { at: "desc" },
      select: { at: true },
    });
    const hasUnreadCustomerMessage =
      lastCustomerMsg !== null &&
      (sr.lastOfficeReadAt === null || sr.lastOfficeReadAt < lastCustomerMsg.at);

    return { ...sr, activity, hasUnreadCustomerMessage };
  },
});
