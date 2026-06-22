/**
 * Portal-side Service Request endpoints (customer auth).
 *
 *   GET  /api/portal/service-requests        — list the caller's SRs
 *   POST /api/portal/service-requests        — UC-SR-01 submit a new SR
 *
 * SKIPPED full `defineMutation` migration on GET: the response shape uses
 * `paginatedResponse` with a post-filter step (site-scope row pruning),
 * which mixes the page-count from the unfiltered query with the rows from
 * the filtered list — that's a quirky pre-existing behaviour we don't want
 * the HOF to paper over.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { defineMutation } from "@/lib/api/mutation";
import {
  paginatedResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import {
  createServiceRequestSchema,
  listServiceRequestQuerySchema,
} from "@/lib/validators/serviceRequest";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";
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
              model: { select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true } },
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

export const POST = defineMutation({
  audience: "customer",
  body: createServiceRequestSchema,
  successStatus: 201,
  handler: async ({ auth, body }) => {
    // Site-scope check on equipment if provided.
    if (body.equipmentId) {
      const eq = await prisma.equipment.findUnique({
        where: { id: body.equipmentId },
        select: { customerId: true, siteId: true },
      });
      if (!eq || eq.customerId !== auth.customerId) {
        throw new ValidationError("Equipment does not belong to your customer");
      }
      const allowed = canViewEquipmentAtSite(
        {
          contactId: auth.contactId,
          customerId: auth.customerId,
          role: auth.role,
          scope: auth.scope,
          siteId: auth.siteId,
        },
        eq.siteId,
      );
      if (!allowed) {
        throw new ValidationError("You cannot submit requests for this equipment");
      }
    }

    // Site-scope check on explicit siteId (added 2026-06). Always optional —
    // if the contact is SITE-scoped, force the SR to their site even when
    // the body doesn't specify it.
    let resolvedSiteId = body.siteId ?? null;
    if (resolvedSiteId) {
      const site = await prisma.site.findUnique({
        where: { id: resolvedSiteId },
        select: { customerId: true },
      });
      if (!site || site.customerId !== auth.customerId) {
        throw new ValidationError("Site does not belong to your customer");
      }
      const allowed = canViewEquipmentAtSite(
        {
          contactId: auth.contactId,
          customerId: auth.customerId,
          role: auth.role,
          scope: auth.scope,
          siteId: auth.siteId,
        },
        resolvedSiteId,
      );
      if (!allowed) {
        throw new ValidationError("You cannot submit requests for this site");
      }
    } else if (auth.scope === "SITE" && auth.siteId) {
      // Site-scoped contacts always submit against their own site.
      resolvedSiteId = auth.siteId;
    }

    return ServiceRequestWorkflow.create({
      customerId: auth.customerId,
      contactId: auth.contactId,
      input: { ...body, siteId: resolvedSiteId ?? undefined },
      actor: {
        actorType: "CUSTOMER",
        actorContactId: auth.contactId,
      },
    });
  },
});
