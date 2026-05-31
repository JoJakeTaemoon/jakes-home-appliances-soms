/**
 * GET    /api/admin/products/categories/[id]
 * PATCH  /api/admin/products/categories/[id]
 * DELETE /api/admin/products/categories/[id]  (soft-delete via isActive=false)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { updateProductCategorySchema } from "@/lib/validators/product";
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
    const row = await prisma.productCategory.findUnique({
      where: { id: params.id },
      include: { _count: { select: { models: true } } },
    });
    if (!row) throw new NotFoundError("Category not found");
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
    const before = await prisma.productCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Category not found");
    const body = await request.json().catch(() => null);
    const parsed = updateProductCategorySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid category payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const updated = await prisma.productCategory.update({
      where: { id },
      data: parsed.data,
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "PRODUCT_CATEGORY_UPDATE",
      entityType: "ProductCategory",
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
    const before = await prisma.productCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Category not found");
    const updated = await prisma.productCategory.update({
      where: { id },
      data: { isActive: false },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "PRODUCT_CATEGORY_DEACTIVATE",
      entityType: "ProductCategory",
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
