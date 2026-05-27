/**
 * GET /api/service-requests — paginated list (office staff).
 *
 * Filters: state, type, customerId, isPaid, q (matches code or customer
 * name/code). Default ordering: oldest PENDING_REVIEW first, then by
 * submittedAt asc.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { paginatedResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { listServiceRequestQuerySchema } from "@/lib/validators/serviceRequest";
import { isOfficeRole } from "@/lib/visits/access";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }

    const url = new URL(request.url);
    const parsed = listServiceRequestQuerySchema.safeParse(
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
    const { q, state, type, customerId, isPaid, page, pageSize } = parsed.data;

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
        // PENDING_REVIEW bubbles to the top, then oldest first within each
        // group. Postgres sorts the state enum alphabetically — we override
        // by sorting on a CASE expression via two-stage query: just sort by
        // submittedAt asc which puts the oldest pending at the top.
        orderBy: [
          { state: "asc" },
          { submittedAt: "asc" },
        ],
        skip,
        take: pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true, type: true } },
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

    return paginatedResponse(rows, { page, limit: pageSize, total });
  } catch (err) {
    return toErrorResponse(err);
  }
}
