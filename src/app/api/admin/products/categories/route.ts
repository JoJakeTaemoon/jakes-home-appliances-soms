/**
 * GET  /api/admin/products/categories  → list ProductCategory (paginated).
 * POST /api/admin/products/categories  → create category (MANAGER+).
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createProductCategorySchema,
  productCategoryListQuerySchema,
} from "@/lib/validators/product";
import { allocateCategoryCode } from "@/lib/products/category-code";
import { ConflictError, ForbiddenError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: productCategoryListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, isActive, brandId, page, pageSize } = query;
    const where: Prisma.ProductCategoryWhereInput = {};
    if (typeof isActive === "boolean") where.isActive = isActive;
    // Only categories that have an *active* model under this brand. Brand and
    // Category are independent taxonomies joined solely through EquipmentModel;
    // matching the model picker's `isActive=true` filter avoids offering a
    // category whose only models are inactive (→ empty model list downstream).
    if (brandId) where.models = { some: { brandId, isActive: true } };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { nameKo: { contains: q, mode: "insensitive" } },
        { nameVi: { contains: q, mode: "insensitive" } },
        { nameEn: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.productCategory.count({ where }),
      prisma.productCategory.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
  },
  body: createProductCategorySchema,
  successStatus: 201,
  handler: async ({ body }) => {
    const taken = async (code: string) =>
      (await prisma.productCategory.findUnique({
        where: { code },
        select: { id: true },
      })) !== null;

    if (body.code) {
      // Typed by hand — say so rather than silently saving something else.
      if (await taken(body.code)) {
        throw new ConflictError(`Category code ${body.code} already exists`);
      }
      return prisma.productCategory.create({ data: { ...body, code: body.code } });
    }
    // Latin-script names only: a Korean name yields no A-Z letters, so the
    // allocator's numeric suffix is what keeps those rows apart.
    const code = await allocateCategoryCode(
      body.nameEn || body.nameVi || body.nameKo,
      taken,
    );
    return prisma.productCategory.create({ data: { ...body, code } });
  },
  audit: {
    action: "PRODUCT_CATEGORY_CREATE",
    entityType: "ProductCategory",
    after: (r) => r,
  },
});
