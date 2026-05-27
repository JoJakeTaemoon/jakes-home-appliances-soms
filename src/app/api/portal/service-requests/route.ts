/**
 * Portal-side Service Request endpoints (customer auth).
 *
 *   GET  /api/portal/service-requests        — list the caller's SRs
 *   POST /api/portal/service-requests        — UC-SR-01 submit a new SR
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import {
  createServiceRequestSchema,
  listServiceRequestQuerySchema,
} from "@/lib/validators/serviceRequest";
import { createServiceRequest } from "@/lib/service-requests/operations";
import { canViewEquipmentAtSite } from "@/lib/auth/customer-access";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);
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
    const { state, type, page, pageSize } = parsed.data;
    const where: Prisma.ServiceRequestWhereInput = {
      customerId: caller.customerId,
    };
    if (state) where.state = state;
    if (type) where.type = type;

    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          equipment: {
            select: {
              id: true,
              serialNumber: true,
              siteId: true,
              model: { select: { modelCode: true, name: true } },
            },
          },
          visit: {
            select: {
              id: true,
              state: true,
              scheduledFor: true,
            },
          },
        },
      }),
    ]);

    // Filter site-scoped OPS: only see SRs on their equipment (or null site).
    const visible = rows.filter((r) => {
      if (!r.equipment) return true;
      return canViewEquipmentAtSite(
        {
          contactId: caller.contactId,
          customerId: caller.customerId,
          role: caller.role,
          scope: caller.scope,
          siteId: caller.siteId,
        },
        r.equipment.siteId,
      );
    });

    return paginatedResponse(visible, { page, limit: pageSize, total });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);
    const body = await request.json().catch(() => null);
    const parsed = createServiceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid service request payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const input = parsed.data;

    // Site-scope check on equipment if provided.
    if (input.equipmentId) {
      const eq = await prisma.equipment.findUnique({
        where: { id: input.equipmentId },
        select: { customerId: true, siteId: true },
      });
      if (!eq || eq.customerId !== caller.customerId) {
        throw new ValidationError("Equipment does not belong to your customer");
      }
      const allowed = canViewEquipmentAtSite(
        {
          contactId: caller.contactId,
          customerId: caller.customerId,
          role: caller.role,
          scope: caller.scope,
          siteId: caller.siteId,
        },
        eq.siteId,
      );
      if (!allowed) {
        throw new ValidationError("You cannot submit requests for this equipment");
      }
    }

    const result = await createServiceRequest({
      customerId: caller.customerId,
      contactId: caller.contactId,
      input,
      actor: {
        actorType: "CUSTOMER",
        actorContactId: caller.contactId,
      },
    });

    return successResponse(result, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
