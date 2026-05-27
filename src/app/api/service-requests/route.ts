/**
 * GET /api/service-requests — paginated list (office staff).
 *
 * Filters: state, type, customerId, isPaid, q (matches code or customer
 * name/code). Default ordering: oldest PENDING_REVIEW first, then by
 * submittedAt asc.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { listServiceRequestQuerySchema } from "@/lib/validators/serviceRequest";
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
