/**
 * GET   /api/equipment-models/[id]
 * PATCH /api/equipment-models/[id]
 *
 * GET migrated to `defineQuery`. PATCH preserves manual flow for AuditLog
 * before/after pair.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { updateEquipmentModelSchema } from "@/lib/validators/equipmentModel";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import {
  CATEGORY_LINKS_SELECT,
  assertModelClassification,
  flattenCategories,
  writeModelCategories,
} from "@/lib/products/classification";

const paramsSchema = z.object({ id: z.string() });

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    const model = await prisma.equipmentModel.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { equipment: true } },
        productType: { select: { id: true, code: true, nameKo: true, nameVi: true, nameEn: true } },
        ...CATEGORY_LINKS_SELECT,
        // The model's filter config for edit prefill (ordered).
        consumables: {
          orderBy: { sortOrder: "asc" },
          include: {
            consumable: {
              select: {
                id: true, sku: true, nameKo: true, nameVi: true, nameEn: true,
                replaceEveryDays: true, replaceCycleUnit: true, retailPrice: true,
              },
            },
          },
        },
      },
    });
    if (!model) throw new NotFoundError("Model not found");
    const categories = flattenCategories(model);
    return { ...model, categories, categoryIds: categories.map((c) => c.id) };
  },
});

/** UPDATE unless this PATCH flipped `isActive` — then DEACTIVATE / REACTIVATE. */
function activationAction(before: boolean, after: boolean): string {
  if (before && !after) return "EQUIPMENT_MODEL_DEACTIVATE";
  if (!before && after) return "EQUIPMENT_MODEL_REACTIVATE";
  return "EQUIPMENT_MODEL_UPDATE";
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const beforeRow = await prisma.equipmentModel.findUnique({
      where: { id },
      include: { categories: { select: { categoryId: true } } },
    });
    if (!beforeRow) throw new NotFoundError("Model not found");
    const { categories: beforeLinks, ...beforeScalars } = beforeRow;
    const beforeCategoryIds = beforeLinks.map((l) => l.categoryId);
    // Flat string so the audit drawer's shallow diff can show it.
    const before = { ...beforeScalars, categoryIds: beforeCategoryIds.join(",") };

    const body = await request.json().catch(() => null);
    const parsed = updateEquipmentModelSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid model payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;
    // Pass Zod-parsed values through without coalescing null→undefined: Prisma
    // treats `undefined` as "don't touch" and `null` as "set to NULL", which
    // matches what nullable+optional schema fields advertise. Coalescing
    // would silently drop `{brandId: null}` clears from the client.
    const updated = await prisma.$transaction(async (tx) => {
      // A PATCH may carry only one of the two — check the merged result, not
      // the delta, so moving a model to a new type re-validates its 제품군.
      const nextCategoryIds = data.categoryIds ?? beforeCategoryIds;
      const nextTypeId =
        data.productTypeId === undefined ? beforeScalars.productTypeId : data.productTypeId;
      if (data.categoryIds !== undefined || data.productTypeId !== undefined) {
        await assertModelClassification(tx, {
          categoryIds: nextCategoryIds,
          productTypeId: nextTypeId,
        });
      }
      const row = await tx.equipmentModel.update({
        where: { id },
        data: {
          nameKo: data.nameKo,
          nameVi: data.nameVi,
          nameEn: data.nameEn,
          brandId: data.brandId,
          productTypeId: data.productTypeId,
          description: data.description,
          retailPrice: data.retailPrice,
          salePrice: data.salePrice,
          purchasePrice: data.purchasePrice,
          fixedPrice: data.fixedPrice,
          monthlyRentalPrice: data.monthlyRentalPrice,
          monthlyMaintenancePrice: data.monthlyMaintenancePrice,
          // stockOnHand is not editable here — it moves through the ledger.
          safetyStock: data.safetyStock,
          inspectionEveryDays: data.inspectionEveryDays,
          warrantyMonths: data.warrantyMonths,
          // Prisma JSON columns don't accept literal null; use Prisma.DbNull.
          filterPolicy:
            data.filterPolicy === undefined
              ? undefined
              : data.filterPolicy === null
                ? Prisma.DbNull
                : data.filterPolicy,
          isActive: data.isActive,
        },
      });
      // When the filter config is supplied, replace it wholesale (wipe +
      // recreate) — same pattern as the consumable-side compatibility write.
      if (data.compatibleConsumables) {
        await tx.consumableOnModel.deleteMany({ where: { modelId: id } });
        if (data.compatibleConsumables.length > 0) {
          await tx.consumableOnModel.createMany({
            data: data.compatibleConsumables.map((f) => ({
              modelId: id,
              consumableId: f.consumableId,
              quantity: f.quantity,
              sortOrder: f.sortOrder,
              replaceEveryDaysOverride: f.replaceEveryDaysOverride ?? null,
            })),
            skipDuplicates: true,
          });
        }
      }
      if (data.categoryIds !== undefined) {
        await writeModelCategories(tx, id, data.categoryIds);
      }
      return { ...row, categoryIds: [...new Set(nextCategoryIds)] };
    });
    // The catalog UI "deletes" a model by PATCHing isActive=false (there is no
    // DELETE route — models are never hard-deleted). Logging that as a plain
    // UPDATE hid every retirement from an audit search filtered on 삭제, so the
    // isActive transition picks its own action, matching BRAND_DEACTIVATE and
    // friends.
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: activationAction(beforeScalars.isActive, updated.isActive),
      entityType: "EquipmentModel",
      entityId: id,
      before,
      after: { ...updated, categoryIds: updated.categoryIds.join(",") },
      request,
    });
    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
