/**
 * GET  /api/visits — paginated list with filters (office sees all,
 *                    technician sees own only as lead OR collaborator).
 * POST /api/visits — create a SUGGESTED visit. Office (STAFF+) only.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import {
  canCreateVisit,
  isOfficeRole,
  technicianVisitWhere,
} from "@/lib/visits/access";
import {
  createVisitSchema,
  visitListQuerySchema,
} from "@/lib/validators/visit";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const url = new URL(request.url);
    const parsed = visitListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid query",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { technicianId, customerId, state, type, from, to, page, pageSize } =
      parsed.data;

    const where: Prisma.VisitWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (state) where.state = state;
    if (type) where.type = type;
    if (from || to) {
      where.scheduledFor = {};
      if (from) (where.scheduledFor as Prisma.DateTimeFilter).gte = from;
      if (to) (where.scheduledFor as Prisma.DateTimeFilter).lte = to;
    }

    if (isOfficeRole(auth.role)) {
      if (technicianId) {
        where.OR = [
          { leadTechnicianId: technicianId },
          { collaboratorTechnicianIds: { has: technicianId } },
        ];
      }
    } else {
      // TECHNICIAN: scope to own visits
      where.OR = [
        { leadTechnicianId: auth.userId },
        { collaboratorTechnicianIds: { has: auth.userId } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        orderBy: { scheduledFor: "asc" },
        skip,
        take: pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true, type: true } },
          leadTechnician: { select: { id: true, username: true } },
          equipment: {
            select: {
              id: true,
              serialNumber: true,
              model: { select: { modelCode: true, name: true } },
            },
          },
        },
      }),
    ]);

    return paginatedResponse(rows, { page, limit: pageSize, total });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canCreateVisit(auth.role)) {
      throw new ForbiddenError("Cannot create visits");
    }

    const body = await request.json().catch(() => null);
    const parsed = createVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid visit payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    if (data.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: data.siteId },
        select: { customerId: true },
      });
      if (!site || site.customerId !== customer.id) {
        throw new ValidationError("Site does not belong to this customer");
      }
    }
    if (data.equipmentId) {
      const eq = await prisma.equipment.findUnique({
        where: { id: data.equipmentId },
        select: { customerId: true },
      });
      if (!eq || eq.customerId !== customer.id) {
        throw new ValidationError(
          "Equipment does not belong to this customer",
        );
      }
    }

    const visit = await prisma.visit.create({
      data: {
        customerId: data.customerId,
        siteId: data.siteId ?? null,
        equipmentId: data.equipmentId ?? null,
        type: data.type,
        state: "SUGGESTED",
        scheduledFor: data.scheduledFor,
        scheduledWindow: data.scheduledWindow ?? null,
        expectedAmount: data.expectedAmount ?? null,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_CREATE",
      entityType: "Visit",
      entityId: visit.id,
      after: {
        customerId: visit.customerId,
        type: visit.type,
        scheduledFor: visit.scheduledFor,
      },
      request,
    });

    return successResponse(visit, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
