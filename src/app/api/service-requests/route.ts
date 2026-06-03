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
import { resolveOrderBy, type SortMap } from "@/lib/api/sort";
import type { Prisma } from "@/generated/prisma/client";

const SR_SORT_MAP: SortMap<Prisma.ServiceRequestOrderByWithRelationInput | Prisma.ServiceRequestOrderByWithRelationInput[]> = {
  code: (dir) => ({ code: dir }),
  type: (dir) => ({ type: dir }),
  state: (dir) => ({ state: dir }),
  isPaid: (dir) => ({ isPaid: dir }),
  submittedAt: (dir) => ({ submittedAt: dir }),
  customer: (dir) => ({ customer: { code: dir } }),
};

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
    const { q, state, type, customerId, isPaid, unread, sortBy, sortDir, page, pageSize } = query;
    const orderBy = resolveOrderBy(
      { sortBy, sortDir },
      SR_SORT_MAP,
      [{ state: "asc" }, { submittedAt: "asc" }],
    );

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

    // Unread tab: pre-compute the set of SR ids that have at least one
    // customer SR_MESSAGE newer than the team's lastOfficeReadAt, then
    // constrain the main query with where.id IN [...]. Done in two
    // steps to keep the listing logic plain Prisma and avoid mixing
    // raw SQL with the existing where builder.
    if (unread === true) {
      const groups = await prisma.auditLog.groupBy({
        by: ["entityId"],
        where: {
          action: "SR_MESSAGE",
          actorType: "CUSTOMER",
          entityType: "ServiceRequest",
        },
        _max: { at: true },
      });
      if (groups.length === 0) {
        return { rows: [], pagination: { page, limit: pageSize, total: 0 } };
      }
      const entityIds = groups
        .map((g) => g.entityId)
        .filter((id): id is string => id !== null);
      const srRows = await prisma.serviceRequest.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, lastOfficeReadAt: true },
      });
      const lastReadById = new Map<string, Date | null>(
        srRows.map((s) => [s.id, s.lastOfficeReadAt]),
      );
      const unreadIds: string[] = [];
      for (const g of groups) {
        if (!g.entityId || !g._max.at) continue;
        const lastRead = lastReadById.get(g.entityId);
        if (lastRead === undefined) continue;
        if (lastRead === null || lastRead < g._max.at) unreadIds.push(g.entityId);
      }
      if (unreadIds.length === 0) {
        return { rows: [], pagination: { page, limit: pageSize, total: 0 } };
      }
      where.id = { in: unreadIds };
    }

    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.findMany({
        where,
        orderBy,
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
              model: { select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true } },
            },
          },
          contact: { select: { id: true, name: true, phone1: true } },
          visit: { select: { id: true, state: true, scheduledFor: true } },
        },
      }),
    ]);

    // Compute hasUnreadCustomerMessage per row. We pull the max
    // `at` of the customer SR_MESSAGE audit rows for these SRs in a
    // single grouped query, then compare to each row's
    // lastOfficeReadAt. A null lastOfficeReadAt means the office team
    // has never marked anything read; any customer message there
    // counts as unread.
    const lastCustomerMsgByEntity = new Map<string, Date>();
    if (rows.length > 0) {
      const groups = await prisma.auditLog.groupBy({
        by: ["entityId"],
        where: {
          action: "SR_MESSAGE",
          actorType: "CUSTOMER",
          entityType: "ServiceRequest",
          entityId: { in: rows.map((r) => r.id) },
        },
        _max: { at: true },
      });
      for (const g of groups) {
        if (g.entityId && g._max.at) lastCustomerMsgByEntity.set(g.entityId, g._max.at);
      }
    }
    const decorated = rows.map((r) => {
      const lastMsg = lastCustomerMsgByEntity.get(r.id) ?? null;
      const hasUnreadCustomerMessage =
        lastMsg !== null &&
        (r.lastOfficeReadAt === null || r.lastOfficeReadAt < lastMsg);
      return { ...r, hasUnreadCustomerMessage };
    });

    return { rows: decorated, pagination: { page, limit: pageSize, total } };
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
