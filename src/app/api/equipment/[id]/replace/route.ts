/**
 * POST /api/equipment/[id]/replace — UC-EQ-04.
 *
 * Replaces a unit with a new one. The old row is marked REPLACED and points
 * (via `replacedByEquipmentId`) to the new row, which is created fresh.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { replaceEquipmentSchema } from "@/lib/validators/equipment";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");
    const { id } = await ctx.params;

    const before = await prisma.equipment.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Equipment not found");
    if (before.status === "REPLACED") throw new ValidationError("Equipment is already replaced");

    const body = await request.json().catch(() => null);
    const parsed = replaceEquipmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;
    const model = await prisma.equipmentModel.findUnique({
      where: { id: data.newModelId },
      select: { id: true },
    });
    if (!model) throw new NotFoundError("Model not found");

    const result = await prisma.$transaction(async (tx) => {
      const newUnit = await tx.equipment.create({
        data: {
          customerId: before.customerId,
          siteId: before.siteId,
          modelId: data.newModelId,
          serialNumber: data.newSerialNumber ?? null,
          ownership: before.ownership,
          installedAt: data.installedAt ?? new Date(),
          status: "ACTIVE",
          notes: data.reason ?? null,
        },
      });
      const oldUnit = await tx.equipment.update({
        where: { id },
        data: {
          status: "REPLACED",
          replacedByEquipmentId: newUnit.id,
          notes: data.reason ?? before.notes,
        },
      });
      return { newUnit, oldUnit };
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_REPLACE",
      entityType: "Equipment",
      entityId: id,
      before,
      after: { newEquipmentId: result.newUnit.id, reason: data.reason },
      request,
    });

    return successResponse({ old: result.oldUnit, new: result.newUnit }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
