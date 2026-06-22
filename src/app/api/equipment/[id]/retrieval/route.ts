/**
 * POST /api/equipment/[id]/retrieval — log the physical retrieval date
 * of an Equipment that's already in TERMINATED state.
 *
 * Retrieval ≠ termination: termination is the billing / contract
 * decision; retrieval is the operational fact that the device actually
 * came back to the warehouse. The two often happen on different days,
 * and retrieval is usually logged after the field visit, so past dates
 * are allowed.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { equipmentRetrievalSchema } from "@/lib/validators/equipment";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot manage equipment");
    }
    const { id } = await ctx.params;

    const before = await prisma.equipment.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Equipment not found");

    if (before.status !== "TERMINATED") {
      throw new ValidationError(
        "Retrieval can only be logged on a TERMINATED equipment. Terminate first.",
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = equipmentRetrievalSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid retrieval payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { retrievedAt, notes } = parsed.data;

    // Sanity: retrieval can't predate termination — you can't physically
    // pick up a device before it was terminated.
    if (before.terminatedAt && retrievedAt < before.terminatedAt) {
      throw new ValidationError(
        "retrievedAt cannot be earlier than the termination date",
      );
    }

    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        retrievedAt,
        notes: notes ?? before.notes,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_RETRIEVAL_LOGGED",
      entityType: "Equipment",
      entityId: id,
      before,
      after: { ...updated, retrievalNotes: notes },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
