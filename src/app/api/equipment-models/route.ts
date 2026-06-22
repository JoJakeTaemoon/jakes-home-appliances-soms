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
    const { q, category, isActive, page, pageSize } = query;
    const where: Prisma.EquipmentModelWhereInput = {};
    if (category) where.category = category;
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
    return prisma.equipmentModel.create({
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
        inspectionEveryMonths: body.inspectionEveryMonths ?? null,
        warrantyMonths: body.warrantyMonths ?? null,
        filterPolicy: body.filterPolicy ?? undefined,
        isActive: body.isActive,
      },
    });
  },
  audit: {
    action: "EQUIPMENT_MODEL_CREATE",
    entityType: "EquipmentModel",
    after: (r) => r,
  },
});
