/**
 * PATCH  /api/equipment/[id]/consumables/[consumableLinkId]
 * DELETE /api/equipment/[id]/consumables/[consumableLinkId]
 *
 * Edit / remove a per-equipment consumable row. PATCH handles cycle
 * overrides + manual filter rename + quantity / unitPrice / notes
 * updates. DELETE removes only the override row; the underlying
 * catalog Consumable + every VisitConsumableLog stays untouched.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { updateEquipmentConsumableSchema } from "@/lib/validators/equipmentConsumable";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string; consumableLinkId: string }>;
}

async function loadOrThrow(equipmentId: string, linkId: string) {
  const row = await prisma.equipmentConsumable.findUnique({
    where: { id: linkId },
  });
  if (!row || row.equipmentId !== equipmentId) {
    throw new NotFoundError("Consumable link not found");
  }
  return row;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot manage equipment");
    }
    const { id, consumableLinkId } = await ctx.params;
    const before = await loadOrThrow(id, consumableLinkId);

    const body = await request.json().catch(() => null);
    const parsed = updateEquipmentConsumableSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid consumable patch",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const d = parsed.data;

    // Manual rows (consumableId null) need a non-null cycle to keep the
    // filter-history table meaningful.
    if (before.consumableId === null && d.replaceEveryMonths === null) {
      throw new ValidationError(
        "Manual filters require a replaceEveryMonths value",
      );
    }

    const updated = await prisma.equipmentConsumable.update({
      where: { id: consumableLinkId },
      data: {
        customName:
          before.consumableId === null && d.customName !== undefined
            ? d.customName
            : undefined,
        quantity: d.quantity ?? undefined,
        replaceEveryMonths:
          d.replaceEveryMonths === undefined
            ? undefined
            : d.replaceEveryMonths,
        unitPrice: d.unitPrice ?? undefined,
        notes: d.notes ?? undefined,
      },
      include: { consumable: true },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_CONSUMABLE_UPDATE",
      entityType: "Equipment",
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
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot manage equipment");
    }
    const { id, consumableLinkId } = await ctx.params;
    const before = await loadOrThrow(id, consumableLinkId);

    await prisma.equipmentConsumable.delete({ where: { id: consumableLinkId } });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_CONSUMABLE_REMOVE",
      entityType: "Equipment",
      entityId: id,
      before,
      after: null,
      request,
    });

    return successResponse({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
