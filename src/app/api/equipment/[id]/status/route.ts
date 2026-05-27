/**
 * POST /api/equipment/[id]/status — change status (deactivate / terminate / reactivate).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { equipmentStatusSchema } from "@/lib/validators/equipment";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["DEACTIVATED", "TERMINATED", "RELOCATED"],
  RELOCATED: ["ACTIVE", "DEACTIVATED", "TERMINATED"],
  DEACTIVATED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
  REPLACED: [],
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");
    const { id } = await ctx.params;

    const before = await prisma.equipment.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Equipment not found");

    const body = await request.json().catch(() => null);
    const parsed = equipmentStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid status payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { status, reason } = parsed.data;
    const allowed = ALLOWED_TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(status)) {
      throw new ValidationError(`Cannot transition equipment from ${before.status} to ${status}`);
    }

    const updated = await prisma.equipment.update({
      where: { id },
      data: { status, notes: reason ?? before.notes },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: `EQUIPMENT_STATUS_${status}`,
      entityType: "Equipment",
      entityId: id,
      before,
      after: { ...updated, reason },
      request,
    });
    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
