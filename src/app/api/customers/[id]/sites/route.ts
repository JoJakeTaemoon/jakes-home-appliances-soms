/**
 * GET  /api/customers/[id]/sites — list sites.
 * POST /api/customers/[id]/sites — create site (B2B only).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageSite, canViewCustomer } from "@/lib/customers/access";
import { createSiteSchema } from "@/lib/validators/site";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canViewCustomer(auth.role)) throw new ForbiddenError("Cannot view customers");
    const { id: customerId } = await ctx.params;

    const sites = await prisma.site.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { equipment: true, contacts: true } } },
    });
    return successResponse(sites);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageSite(auth.role)) throw new ForbiddenError("Cannot manage sites");
    const { id: customerId } = await ctx.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");
    if (customer.type !== "B2B") {
      throw new ValidationError("Sites are only available for B2B customers");
    }

    const body = await request.json().catch(() => null);
    const parsed = createSiteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid site payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const created = await prisma.site.create({
      data: {
        customerId,
        name: data.name,
        address: data.address,
        district: data.district ?? null,
        city: data.city ?? null,
        region: data.region ?? null,
        notes: data.notes ?? null,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "SITE_CREATE",
      entityType: "Site",
      entityId: created.id,
      after: created,
      request,
    });

    return successResponse(created, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
