/**
 * GET   /api/equipment/[id]
 * PATCH /api/equipment/[id]
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { updateEquipmentSchema } from "@/lib/validators/equipment";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    await requireAuth(request);
    const { id } = await ctx.params;
    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true, type: true } },
        site: { select: { id: true, name: true, address: true } },
        model: true,
        contracts: { include: { contract: true } },
      },
    });
    if (!equipment) throw new NotFoundError("Equipment not found");
    return successResponse(equipment);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");
    const { id } = await ctx.params;

    const before = await prisma.equipment.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Equipment not found");

    const body = await request.json().catch(() => null);
    const parsed = updateEquipmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid equipment payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;
    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        serialNumber: data.serialNumber,
        ownership: data.ownership,
        installedAt: data.installedAt,
        installedByTechnicianId: data.installedByTechnicianId ?? undefined,
        filterPolicyOverride:
          data.filterPolicyOverride === null
            ? undefined // Prisma type prefers undefined for nullable JSON unset
            : (data.filterPolicyOverride as object | undefined),
        notes: data.notes,
      },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_UPDATE",
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
