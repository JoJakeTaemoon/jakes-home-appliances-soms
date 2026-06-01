/**
 * GET    /api/admin/products/consumables/[id]
 * PATCH  /api/admin/products/consumables/[id]   (also rewrites compatibility)
 * DELETE /api/admin/products/consumables/[id]   (soft-delete via isActive)
 *
 * The PATCH handler enforces "at least one cycle is non-null" AFTER merging
 * with the existing row — partial updates are valid as long as the merged
 * state stays well-formed.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { updateConsumableSchema } from "@/lib/validators/product";
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
    const row = await prisma.consumable.findUnique({
      where: { id: params.id },
      include: {
        compatibleModels: {
          select: {
            modelId: true,
            quantity: true,
            model: { select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundError("Consumable not found");
    return row;
  },
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await prisma.consumable.findUnique({
      where: { id },
      include: { compatibleModels: { select: { modelId: true, quantity: true } } },
    });
    if (!before) throw new NotFoundError("Consumable not found");

    const body = await request.json().catch(() => null);
    const parsed = updateConsumableSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid consumable payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    // Merge cycle fields with existing values to enforce the "at least one
    // cycle or cleanOnEveryVisit" invariant on the resulting state.
    const replaceMerged =
      data.replaceEveryMonths === undefined ? before.replaceEveryMonths : data.replaceEveryMonths;
    const cleanMerged =
      data.cleanEveryMonths === undefined ? before.cleanEveryMonths : data.cleanEveryMonths;
    const cleanOnVisitMerged =
      data.cleanOnEveryVisit === undefined ? before.cleanOnEveryVisit : data.cleanOnEveryVisit;
    if (replaceMerged == null && cleanMerged == null && !cleanOnVisitMerged) {
      throw new ValidationError(
        "At least one of replaceEveryMonths, cleanEveryMonths or cleanOnEveryVisit must be set",
        [{ path: ["replaceEveryMonths"], message: "required" }],
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.consumable.update({
        where: { id },
        data: {
          sku: data.sku,
          nameKo: data.nameKo,
          nameVi: data.nameVi,
          nameEn: data.nameEn,
          replaceEveryMonths: replaceMerged,
          cleanEveryMonths: cleanMerged,
          cleanOnEveryVisit: data.cleanOnEveryVisit,
          retailPrice: data.retailPrice,
          notes: data.notes,
          isActive: data.isActive,
        },
      });
      if (data.compatibleModels) {
        await tx.consumableOnModel.deleteMany({ where: { consumableId: id } });
        if (data.compatibleModels.length > 0) {
          await tx.consumableOnModel.createMany({
            data: data.compatibleModels.map((m) => ({
              consumableId: id,
              modelId: m.modelId,
              quantity: m.quantity,
            })),
          });
        }
      }
      return row;
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONSUMABLE_UPDATE",
      entityType: "Consumable",
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

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await prisma.consumable.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Consumable not found");
    const updated = await prisma.consumable.update({
      where: { id },
      data: { isActive: false },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONSUMABLE_DEACTIVATE",
      entityType: "Consumable",
      entityId: id,
      before,
      after: updated,
      request,
    });
    return successResponse({ id, isActive: false });
  } catch (err) {
    return toErrorResponse(err);
  }
}
