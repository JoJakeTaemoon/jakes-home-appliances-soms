/**
 * GET  /api/admin/products/product-types  → list 제품 유형 (paginated).
 * POST /api/admin/products/product-types  → create (MANAGER+).
 *
 * A type belongs to one or more 제품군 (`categoryIds`, min 1 — enforced by
 * the schema). Code is minted from the name when left blank, same allocator
 * as 제품군.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createProductTypeSchema,
  productTypeListQuerySchema,
} from "@/lib/validators/product";
import { allocateCategoryCode } from "@/lib/products/category-code";
import { CATEGORY_LINKS_SELECT, flattenCategories } from "@/lib/products/classification";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: productTypeListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, isActive, categoryId, page, pageSize } = query;
    const where: Prisma.ProductTypeWhereInput = {};
    if (typeof isActive === "boolean") where.isActive = isActive;
    if (categoryId) where.categories = { some: { categoryId } };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { nameKo: { contains: q, mode: "insensitive" } },
        { nameVi: { contains: q, mode: "insensitive" } },
        { nameEn: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.productType.count({ where }),
      prisma.productType.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { ...CATEGORY_LINKS_SELECT, _count: { select: { models: true } } },
      }),
    ]);
    return {
      rows: rows.map((r) => {
        const categories = flattenCategories(r);
        return { ...r, categories, categoryIds: categories.map((c) => c.id) };
      }),
      pagination: { page, limit: pageSize, total },
    };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
  },
  body: createProductTypeSchema,
  successStatus: 201,
  handler: async ({ body }) => {
    const taken = async (code: string) =>
      (await prisma.productType.findUnique({ where: { code }, select: { id: true } })) !== null;

    const categoryIds = [...new Set(body.categoryIds)];
    const found = await prisma.productCategory.count({ where: { id: { in: categoryIds } } });
    if (found !== categoryIds.length) {
      throw new ValidationError("Unknown 제품군", [
        { path: ["categoryIds"], message: "One or more 제품군 do not exist" },
      ]);
    }

    let code = body.code;
    if (code) {
      if (await taken(code)) throw new ConflictError(`Type code ${code} already exists`);
    } else {
      code = await allocateCategoryCode(body.nameEn || body.nameVi || body.nameKo, taken);
    }

    const row = await prisma.productType.create({
      data: {
        code,
        nameKo: body.nameKo,
        nameVi: body.nameVi,
        nameEn: body.nameEn,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
    });
    return { ...row, categoryIds };
  },
  audit: {
    action: "PRODUCT_TYPE_CREATE",
    entityType: "ProductType",
    // Flat string so the audit drawer's shallow diff can show it.
    after: (r) => ({ ...r, categoryIds: r.categoryIds.join(",") }),
  },
});
