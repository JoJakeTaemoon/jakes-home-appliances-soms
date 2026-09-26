/**
 * GET    /api/admin/products/product-types/[id]
 * PATCH  /api/admin/products/product-types/[id]
 * DELETE /api/admin/products/product-types/[id]  (soft: isActive=false)
 *
 * PATCH may replace the 제품군 set, but never drop one that a model of this
 * type still uses — that model would then break the rule "a typed model's
 * 제품군 are all the type's" without anyone having touched it (409).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { updateProductTypeSchema } from "@/lib/validators/product";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import {
  CATEGORY_LINKS_SELECT,
  assertTypeKeepsModelCategories,
  flattenCategories,
} from "@/lib/products/classification";

const paramsSchema = z.object({ id: z.string() });

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    const row = await prisma.productType.findUnique({
      where: { id: params.id },
      include: { ...CATEGORY_LINKS_SELECT, _count: { select: { models: true } } },
    });
    if (!row) throw new NotFoundError("Product type not found");
    const categories = flattenCategories(row);
    return { ...row, categories, categoryIds: categories.map((c) => c.id) };
  },
});

/** Scalars + the 제품군 set flattened to a string, for the audit drawer. */
async function snapshot(id: string) {
  const row = await prisma.productType.findUnique({
    where: { id },
    include: { categories: { select: { categoryId: true } } },
  });
  if (!row) return null;
  const { categories, ...scalars } = row;
  return { ...scalars, categoryIds: categories.map((c) => c.categoryId).join(",") };
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await snapshot(id);
    if (!before) throw new NotFoundError("Product type not found");
    const body = await request.json().catch(() => null);
    const parsed = updateProductTypeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid product type payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { categoryIds, ...scalars } = parsed.data;
    await prisma.$transaction(async (tx) => {
      if (categoryIds) {
        const unique = [...new Set(categoryIds)];
        const found = await tx.productCategory.count({ where: { id: { in: unique } } });
        if (found !== unique.length) {
          throw new ValidationError("Unknown 제품군", [
            { path: ["categoryIds"], message: "One or more 제품군 do not exist" },
          ]);
        }
        await assertTypeKeepsModelCategories(tx, id, unique);
      }
      await tx.productType.update({
        where: { id },
        data: {
          ...scalars,
          categories: categoryIds
            ? {
                deleteMany: {},
                create: [...new Set(categoryIds)].map((categoryId) => ({ categoryId })),
              }
            : undefined,
        },
      });
    });
    const after = await snapshot(id);
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "PRODUCT_TYPE_UPDATE",
      entityType: "ProductType",
      entityId: id,
      before,
      after,
      request,
    });
    const fresh = await prisma.productType.findUnique({
      where: { id },
      include: CATEGORY_LINKS_SELECT,
    });
    const categories = fresh ? flattenCategories(fresh) : [];
    return successResponse({ ...fresh, categories, categoryIds: categories.map((c) => c.id) });
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
    const before = await snapshot(id);
    if (!before) throw new NotFoundError("Product type not found");
    // Soft: models keep naming the type they were filed under.
    await prisma.productType.update({ where: { id }, data: { isActive: false } });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "PRODUCT_TYPE_DEACTIVATE",
      entityType: "ProductType",
      entityId: id,
      before,
      after: { ...before, isActive: false },
      request,
    });
    return successResponse({ id, isActive: false });
  } catch (err) {
    return toErrorResponse(err);
  }
}
