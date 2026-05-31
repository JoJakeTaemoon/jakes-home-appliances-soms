/**
 * GET    /api/admin/products/brands/[id]
 * PATCH  /api/admin/products/brands/[id]
 * DELETE /api/admin/products/brands/[id] — soft-delete via isActive=false.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { updateBrandSchema } from "@/lib/validators/brand";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

const paramsSchema = z.object({ id: z.string() });

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    const row = await prisma.brand.findUnique({
      where: { id: params.id },
      include: { _count: { select: { models: true } } },
    });
    if (!row) throw new NotFoundError("Brand not found");
    return row;
  },
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await prisma.brand.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Brand not found");
    const body = await request.json().catch(() => null);
    const parsed = updateBrandSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid brand payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const updated = await prisma.brand.update({ where: { id }, data: parsed.data });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "BRAND_UPDATE",
      entityType: "Brand",
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

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await prisma.brand.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Brand not found");
    const updated = await prisma.brand.update({
      where: { id },
      data: { isActive: false },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "BRAND_DEACTIVATE",
      entityType: "Brand",
      entityId: id,
      before,
      after: updated,
      request,
    });
    return successResponse({ id, isActive: false });
  } catch (err) {
    return toErrorResponse(err);
  }
}
