/**
 * GET  /api/equipment-models — list (paginated).
 * POST /api/equipment-models — create model (MANAGER+).
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createEquipmentModelSchema,
  equipmentModelListQuerySchema,
} from "@/lib/validators/equipmentModel";
import { ForbiddenError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: equipmentModelListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, category, brandId, categoryId, isActive, page, pageSize } = query;
    const where: Prisma.EquipmentModelWhereInput = {};
    if (category) where.category = category;
    if (brandId) where.brandId = brandId;
    if (categoryId) where.categoryId = categoryId;
    if (typeof isActive === "boolean") where.isActive = isActive;
    if (q) {
      where.OR = [
        { modelCode: { contains: q, mode: "insensitive" } },
        { nameKo: { contains: q, mode: "insensitive" } },
        { nameVi: { contains: q, mode: "insensitive" } },
        { nameEn: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.equipmentModel.count({ where }),
      prisma.equipmentModel.findMany({
        where,
        orderBy: { modelCode: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          brand: { select: { id: true, name: true } },
          productCategory: { select: { id: true, nameKo: true, nameVi: true, nameEn: true } },
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
  body: createEquipmentModelSchema,
  successStatus: 201,
  handler: async ({ body }) => {
    const filters = body.compatibleConsumables ?? [];
    return prisma.$transaction(async (tx) => {
      const model = await tx.equipmentModel.create({
        data: {
          nameKo: body.nameKo ?? null,
          nameVi: body.nameVi ?? null,
          nameEn: body.nameEn ?? null,
          brandId: body.brandId ?? null,
          category: body.category ?? null,
          categoryId: body.categoryId ?? null,
          description: body.description ?? null,
          retailPrice: body.retailPrice ?? null,
          monthlyRentalPrice: body.monthlyRentalPrice ?? null,
          monthlyMaintenancePrice: body.monthlyMaintenancePrice ?? null,
          inspectionEveryDays: body.inspectionEveryDays ?? null,
          warrantyMonths: body.warrantyMonths ?? null,
          filterPolicy: body.filterPolicy ?? undefined,
          isActive: body.isActive,
        },
      });
      if (filters.length > 0) {
        await tx.consumableOnModel.createMany({
          data: filters.map((f) => ({
            modelId: model.id,
            consumableId: f.consumableId,
            quantity: f.quantity,
            sortOrder: f.sortOrder,
            replaceEveryDaysOverride: f.replaceEveryDaysOverride ?? null,
          })),
          skipDuplicates: true,
        });
      }
      return model;
    });
  },
  audit: {
    action: "EQUIPMENT_MODEL_CREATE",
    entityType: "EquipmentModel",
    after: (r) => r,
  },
});
