/**
 * GET /api/service-requests — paginated list (office staff).
 *
 * Filters: state, type, customerId, isPaid, q (matches code or customer
 * name/code). Default ordering: oldest PENDING_REVIEW first, then by
 * submittedAt asc.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  listServiceRequestQuerySchema,
  staffCreateServiceRequestSchema,
} from "@/lib/validators/serviceRequest";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!ServiceRequestWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
  },
  query: listServiceRequestQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, state, type, customerId, isPaid, page, pageSize } = query;

    const where: Prisma.ServiceRequestWhereInput = {};
    if (state) where.state = state;
    if (type) where.type = type;
    if (customerId) where.customerId = customerId;
    if (isPaid !== undefined) where.isPaid = isPaid;
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { code: { contains: q, mode: "insensitive" } } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.findMany({
        where,
        orderBy: [{ state: "asc" }, { submittedAt: "asc" }],
        skip,
        take: pageSize,
        include: {
          customer: {
            select: { id: true, code: true, name: true, type: true },
          },
          equipment: {
            select: {
              id: true,
              serialNumber: true,
              model: { select: { modelCode: true, name: true } },
            },
          },
          contact: { select: { id: true, name: true, phone1: true } },
          visit: { select: { id: true, state: true, scheduledFor: true } },
        },
      }),
    ]);

    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

/**
 * POST /api/service-requests — manual SR creation by office staff (UC-SR-01,
 * staff path). Used when a customer phones in instead of using the portal.
 * Body adds `customerId` (required) + optional `contactId` to the standard
 * portal create payload.
 */
export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!ServiceRequestWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
  },
  body: staffCreateServiceRequestSchema,
  successStatus: 201,
  handler: async ({ auth, body }) => {
    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    if (body.equipmentId) {
      const eq = await prisma.equipment.findUnique({
        where: { id: body.equipmentId },
        select: { customerId: true },
      });
      if (!eq || eq.customerId !== body.customerId) {
        throw new ValidationError("Equipment does not belong to the selected customer");
      }
    }

    if (body.contactId) {
      const contact = await prisma.customerContact.findUnique({
        where: { id: body.contactId },
        select: { customerId: true },
      });
      if (!contact || contact.customerId !== body.customerId) {
        throw new ValidationError("Contact does not belong to the selected customer");
      }
    }

    const { customerId, contactId, ...input } = body;
    return ServiceRequestWorkflow.create({
      customerId,
      contactId: contactId ?? null,
      input,
      actor: {
        actorType: "USER",
        actorUserId: auth.userId,
      },
    });
  },
});
