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
import { recordOpeningStock } from "@/lib/inventory/moves";
import {
  CATEGORY_LINKS_SELECT,
  assertModelClassification,
  flattenCategories,
  writeModelCategories,
} from "@/lib/products/classification";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: equipmentModelListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, brandId, categoryId, productTypeId, isActive, page, pageSize } = query;
    const where: Prisma.EquipmentModelWhereInput = {};
    if (brandId) where.brandId = brandId;
    // A model sits in every 제품군 it links to.
    if (categoryId) where.categories = { some: { categoryId } };
    if (productTypeId) where.productTypeId = productTypeId;
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
          productType: { select: { id: true, code: true, nameKo: true, nameVi: true, nameEn: true } },
          ...CATEGORY_LINKS_SELECT,
        },
      }),
    ]);
    // Flatten the links so clients get `categories: CategoryLite[]` plus the
    // bare ids for filtering.
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
  body: createEquipmentModelSchema,
  successStatus: 201,
  handler: async ({ body, auth }) => {
    const filters = body.compatibleConsumables ?? [];
    return prisma.$transaction(async (tx) => {
      await assertModelClassification(tx, {
        categoryIds: body.categoryIds,
        productTypeId: body.productTypeId ?? null,
      });
      const model = await tx.equipmentModel.create({
        data: {
          nameKo: body.nameKo ?? null,
          nameVi: body.nameVi ?? null,
          nameEn: body.nameEn ?? null,
          brandId: body.brandId ?? null,
          productTypeId: body.productTypeId ?? null,
          description: body.description ?? null,
          retailPrice: body.retailPrice ?? null,
          salePrice: body.salePrice ?? null,
          purchasePrice: body.purchasePrice ?? null,
          fixedPrice: body.fixedPrice ?? null,
          monthlyRentalPrice: body.monthlyRentalPrice ?? null,
          monthlyMaintenancePrice: body.monthlyMaintenancePrice ?? null,
          safetyStock: body.safetyStock,
          inspectionEveryDays: body.inspectionEveryDays ?? null,
          warrantyMonths: body.warrantyMonths ?? null,
          filterPolicy: body.filterPolicy ?? undefined,
          isActive: body.isActive,
        },
      });
      await writeModelCategories(tx, model.id, body.categoryIds);
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
      // Opening stock as a single ADJUST move so ledger == cached counter.
      await recordOpeningStock(tx, {
        itemKind: "MODEL",
        equipmentModelId: model.id,
        qty: body.stockOnHand,
        createdById: auth.userId,
      });
      return { ...model, categoryIds: [...new Set(body.categoryIds)] };
    });
  },
  audit: {
    action: "EQUIPMENT_MODEL_CREATE",
    entityType: "EquipmentModel",
    // Flat string so the audit drawer's shallow diff can show it.
    after: (r) => ({ ...r, categoryIds: r.categoryIds.join(",") }),
  },
});
