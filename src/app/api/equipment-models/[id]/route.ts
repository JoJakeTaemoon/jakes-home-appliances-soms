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
    return model;
  },
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await prisma.equipmentModel.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Model not found");

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
      const row = await tx.equipmentModel.update({
        where: { id },
        data: {
          nameKo: data.nameKo,
          nameVi: data.nameVi,
          nameEn: data.nameEn,
          brandId: data.brandId,
          category: data.category,
          categoryId: data.categoryId,
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
      return row;
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_MODEL_UPDATE",
      entityType: "EquipmentModel",
      entityId: id,
      before,
      after: updated,
      request,
    });
    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
