/**
 * POST /api/equipment/[id]/move-site
 *
 * Relocate equipment between sites of the SAME customer. Sets status to
 * RELOCATED on the old assignment briefly, but in our model we just mutate
 * `siteId` in-place and record the move in AuditLog (the schema doesn't
 * carry a per-move table at this point — Phase 4 may add VisitType.RELOCATION).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { moveSiteSchema } from "@/lib/validators/equipment";
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

    const body = await request.json().catch(() => null);
    const parsed = moveSiteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { siteId, reason } = parsed.data;
    if (siteId) {
      const site = await prisma.site.findFirst({
        where: { id: siteId, customerId: before.customerId },
        select: { id: true },
      });
      if (!site) throw new NotFoundError("Target site does not belong to the same customer");
    }
    if (siteId === before.siteId) {
      throw new ValidationError("Target site is the current site");
    }

    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        siteId: siteId,
        status: "ACTIVE",
        notes: reason ?? before.notes,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_MOVE_SITE",
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
