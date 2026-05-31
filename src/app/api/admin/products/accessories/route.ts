/**
 * GET  /api/admin/products/accessories  → list (paginated, optional modelId).
 * POST /api/admin/products/accessories  → create + write compatibility.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createAccessorySchema,
  accessoryListQuerySchema,
} from "@/lib/validators/product";
import { ConflictError, ForbiddenError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: accessoryListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, modelId, isActive, page, pageSize } = query;
    const where: Prisma.AccessoryWhereInput = {};
    if (typeof isActive === "boolean") where.isActive = isActive;
    if (modelId) where.compatibleModels = { some: { modelId } };
    if (q) {
      where.OR = [
        { sku: { contains: q, mode: "insensitive" } },
        { nameKo: { contains: q, mode: "insensitive" } },
        { nameVi: { contains: q, mode: "insensitive" } },
        { nameEn: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.accessory.count({ where }),
      prisma.accessory.findMany({
        where,
        orderBy: { sku: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          compatibleModels: {
            select: { modelId: true, model: { select: { modelCode: true, name: true } } },
          },
        },
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
  body: createAccessorySchema,
  successStatus: 201,
  handler: async ({ body }) => {
    const existing = await prisma.accessory.findUnique({
      where: { sku: body.sku },
      select: { id: true },
    });
    if (existing) throw new ConflictError(`SKU ${body.sku} already exists`);
    return prisma.$transaction(async (tx) => {
      const row = await tx.accessory.create({
        data: {
          sku: body.sku,
          nameKo: body.nameKo,
          nameVi: body.nameVi,
          nameEn: body.nameEn,
          retailPrice: body.retailPrice,
          notes: body.notes ?? null,
          isActive: body.isActive,
        },
      });
      for (const modelId of body.compatibleModelIds) {
        await tx.accessoryOnModel.create({
          data: { accessoryId: row.id, modelId },
        });
      }
      return row;
    });
  },
  audit: {
    action: "ACCESSORY_CREATE",
    entityType: "Accessory",
    after: (r) => r,
  },
});
