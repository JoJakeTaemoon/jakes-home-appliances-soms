/**
 * GET  /api/admin/products/consumables  → list (paginated, optional modelId).
 * POST /api/admin/products/consumables  → create + write compatibility.
 *
 * MANAGER+ only. The compatibility join is a small N (a model has ~3-8 parts)
 * so we wipe + recreate inside a transaction rather than diff.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createConsumableSchema,
  consumableListQuerySchema,
} from "@/lib/validators/product";
import { ConflictError, ForbiddenError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: consumableListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, modelId, isActive, page, pageSize } = query;
    const where: Prisma.ConsumableWhereInput = {};
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
      prisma.consumable.count({ where }),
      prisma.consumable.findMany({
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
  body: createConsumableSchema,
  successStatus: 201,
  handler: async ({ body }) => {
    const existing = await prisma.consumable.findUnique({
      where: { sku: body.sku },
      select: { id: true },
    });
    if (existing) throw new ConflictError(`SKU ${body.sku} already exists`);
    return prisma.$transaction(async (tx) => {
      const row = await tx.consumable.create({
        data: {
          sku: body.sku,
          nameKo: body.nameKo,
          nameVi: body.nameVi,
          nameEn: body.nameEn,
          replaceEveryMonths: body.replaceEveryMonths ?? null,
          cleanEveryMonths: body.cleanEveryMonths ?? null,
          retailPrice: body.retailPrice,
          notes: body.notes ?? null,
          isActive: body.isActive,
        },
      });
      for (const modelId of body.compatibleModelIds) {
        await tx.consumableOnModel.create({
          data: { consumableId: row.id, modelId },
        });
      }
      return row;
    });
  },
  audit: {
    action: "CONSUMABLE_CREATE",
    entityType: "Consumable",
    after: (r) => r,
  },
});
