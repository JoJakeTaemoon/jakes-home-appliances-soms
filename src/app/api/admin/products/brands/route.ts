/**
 * GET  /api/admin/products/brands  → list (paginated).
 * POST /api/admin/products/brands  → create (MANAGER+).
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { createBrandSchema, brandListQuerySchema } from "@/lib/validators/brand";
import { ConflictError, ForbiddenError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: brandListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, isActive, page, pageSize } = query;
    const where: Prisma.BrandWhereInput = {};
    if (typeof isActive === "boolean") where.isActive = isActive;
    if (q) where.name = { contains: q, mode: "insensitive" };
    const [total, rows] = await Promise.all([
      prisma.brand.count({ where }),
      prisma.brand.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { models: true } } },
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
  body: createBrandSchema,
  successStatus: 201,
  handler: async ({ body }) => {
    const existing = await prisma.brand.findUnique({
      where: { name: body.name },
      select: { id: true },
    });
    if (existing) throw new ConflictError(`Brand "${body.name}" already exists`);
    return prisma.brand.create({ data: body });
  },
  audit: {
    action: "BRAND_CREATE",
    entityType: "Brand",
    after: (r) => r,
  },
});
