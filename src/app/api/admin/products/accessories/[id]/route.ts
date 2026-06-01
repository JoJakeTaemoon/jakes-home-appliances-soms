/**
 * GET    /api/admin/products/accessories/[id]
 * PATCH  /api/admin/products/accessories/[id]   (also rewrites compatibility)
 * DELETE /api/admin/products/accessories/[id]   (soft-delete via isActive)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { updateAccessorySchema } from "@/lib/validators/product";
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
    const row = await prisma.accessory.findUnique({
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
    if (!row) throw new NotFoundError("Accessory not found");
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
    const before = await prisma.accessory.findUnique({
      where: { id },
      include: { compatibleModels: { select: { modelId: true, quantity: true } } },
    });
    if (!before) throw new NotFoundError("Accessory not found");

    const body = await request.json().catch(() => null);
    const parsed = updateAccessorySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid accessory payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.accessory.update({
        where: { id },
        data: {
          sku: data.sku,
          nameKo: data.nameKo,
          nameVi: data.nameVi,
          nameEn: data.nameEn,
          isMinorPart: data.isMinorPart,
          retailPrice: data.retailPrice,
          notes: data.notes,
          isActive: data.isActive,
        },
      });
      if (data.compatibleModels) {
        await tx.accessoryOnModel.deleteMany({ where: { accessoryId: id } });
        if (data.compatibleModels.length > 0) {
          await tx.accessoryOnModel.createMany({
            data: data.compatibleModels.map((m) => ({
              accessoryId: id,
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
      action: "ACCESSORY_UPDATE",
      entityType: "Accessory",
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
    const before = await prisma.accessory.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Accessory not found");
    const updated = await prisma.accessory.update({
      where: { id },
      data: { isActive: false },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "ACCESSORY_DEACTIVATE",
      entityType: "Accessory",
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
