/**
 * GET   /api/customers/[id] — full customer with contacts/sites/equipment/audit.
 * PATCH /api/customers/[id] — update non-contract fields.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  canUpdateCustomer,
  canViewCustomer,
} from "@/lib/customers/access";
import { updateCustomerSchema } from "@/lib/validators/customer";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canViewCustomer(auth.role)) throw new ForbiddenError("Cannot view customers");
    const { id } = await ctx.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ role: "asc" }, { isPrimary: "desc" }, { createdAt: "asc" }] },
        sites: { orderBy: { createdAt: "asc" }, include: { _count: { select: { equipment: true, contacts: true } } } },
        equipment: {
          where: { status: { not: "REPLACED" } },
          include: { model: true, site: true },
          orderBy: { createdAt: "desc" },
        },
        contracts: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    const recentAudit = await prisma.auditLog.findMany({
      where: { entityType: "Customer", entityId: id },
      orderBy: { at: "desc" },
      take: 20,
      include: { actorUser: { select: { id: true, username: true, role: true } } },
    });

    return successResponse({ ...customer, recentAudit });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canUpdateCustomer(auth.role)) throw new ForbiddenError("Cannot update customers");
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const before = await prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Customer not found");

    // B2B shortcode uniqueness when changed.
    if (data.shortcode && data.shortcode !== before.shortcode) {
      if (before.type !== "B2B") {
        throw new ValidationError("Only B2B customers may have a shortcode");
      }
      const dup = await prisma.customer.findFirst({
        where: { shortcode: data.shortcode, id: { not: id } },
        select: { code: true },
      });
      if (dup) throw new ConflictError(`Shortcode in use (customer ${dup.code})`);
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        shortcode: data.shortcode,
        taxCode: data.taxCode,
        address: data.address,
        district: data.district,
        city: data.city,
        preferredRegion: data.preferredRegion,
        preferredTechnicianId: data.preferredTechnicianId ?? null,
        notes: data.notes,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CUSTOMER_UPDATE",
      entityType: "Customer",
      entityId: id,
      before,
      after: updated,
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
