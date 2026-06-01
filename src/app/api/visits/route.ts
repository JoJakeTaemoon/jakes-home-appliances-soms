/**
 * GET  /api/visits — paginated list with filters (office sees all,
 *                    technician sees own only as lead OR collaborator).
 * POST /api/visits — create a SUGGESTED visit. Office (STAFF+) only.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import {
  createVisitSchema,
  visitListQuerySchema,
} from "@/lib/validators/visit";
import { resolveOrderBy, type SortMap } from "@/lib/api/sort";
import type { Prisma } from "@/generated/prisma/client";

const VISIT_SORT_MAP: SortMap<Prisma.VisitOrderByWithRelationInput> = {
  scheduledFor: (dir) => ({ scheduledFor: dir }),
  type: (dir) => ({ type: dir }),
  state: (dir) => ({ state: dir }),
  customer: (dir) => ({ customer: { code: dir } }),
  technician: (dir) => ({ leadTechnician: { username: dir } }),
  createdAt: (dir) => ({ createdAt: dir }),
};

export const GET = defineQuery({
  audience: "staff",
  query: visitListQuerySchema,
  paginated: true,
  handler: async ({ auth, query }) => {
    const { q, technicianId, customerId, state, type, from, to, sortBy, sortDir, page, pageSize } =
      query;
    const orderBy = resolveOrderBy({ sortBy, sortDir }, VISIT_SORT_MAP, { scheduledFor: "asc" });

    const where: Prisma.VisitWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (state) where.state = state;
    if (type) where.type = type;
    if (from || to) {
      where.scheduledFor = {};
      if (from) (where.scheduledFor as Prisma.DateTimeFilter).gte = from;
      if (to) (where.scheduledFor as Prisma.DateTimeFilter).lte = to;
    }
    if (q) {
      const term = q.trim();
      where.AND = [
        {
          OR: [
            { customer: { name: { contains: term, mode: "insensitive" } } },
            { customer: { code: { contains: term, mode: "insensitive" } } },
            { equipment: { serialNumber: { contains: term, mode: "insensitive" } } },
            { equipment: { model: { nameKo: { contains: term, mode: "insensitive" } } } },
            { equipment: { model: { nameVi: { contains: term, mode: "insensitive" } } } },
            { equipment: { model: { nameEn: { contains: term, mode: "insensitive" } } } },
            { findings: { contains: term, mode: "insensitive" } },
          ],
        },
      ];
    }

    if (VisitWorkflow.access.isOfficeRole(auth.role)) {
      if (technicianId) {
        where.OR = [
          { leadTechnicianId: technicianId },
          { collaboratorTechnicianIds: { has: technicianId } },
        ];
      }
    } else {
      const filter = VisitWorkflow.access.technicianVisitWhere({
        userId: auth.userId,
        role: auth.role,
      });
      where.OR = [...filter.OR];
    }

    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true, type: true } },
          leadTechnician: { select: { id: true, username: true } },
          equipment: {
            select: {
              id: true,
              serialNumber: true,
              model: { select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true } },
            },
          },
        },
      }),
    ]);

    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.canCreate(auth.role)) {
      throw new ForbiddenError("Cannot create visits");
    }
  },
  body: createVisitSchema,
  successStatus: 201,
  handler: ({ auth, body, request }) =>
    VisitWorkflow.create(
      {
        customerId: body.customerId,
        siteId: body.siteId ?? null,
        equipmentId: body.equipmentId ?? null,
        type: body.type,
        scheduledFor: body.scheduledFor,
        scheduledWindow: body.scheduledWindow ?? null,
        expectedAmount: body.expectedAmount ?? null,
      },
      { userId: auth.userId, role: auth.role },
      request,
    ),
});
