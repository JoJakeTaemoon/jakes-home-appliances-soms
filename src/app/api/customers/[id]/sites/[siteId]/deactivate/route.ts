/**
 * POST /api/customers/[id]/sites/[siteId]/deactivate
 *
 * MANAGER+ only. Marks site inactive, cascades active equipment at the site
 * to DEACTIVATED.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canDeactivateSite } from "@/lib/customers/access";
import { deactivateSiteSchema } from "@/lib/validators/site";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string; siteId: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canDeactivateSite(auth.role)) throw new ForbiddenError("MANAGER+ required");
    const { id: customerId, siteId } = await ctx.params;

    const before = await prisma.site.findFirst({ where: { id: siteId, customerId } });
    if (!before) throw new NotFoundError("Site not found");
    if (!before.isActive) throw new ValidationError("Site is already inactive");

    const body = await request.json().catch(() => null);
    const parsed = deactivateSiteSchema.safeParse(body ?? { reason: "(no reason)" });
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.site.update({
        where: { id: siteId },
        data: { isActive: false, notes: parsed.data.reason },
      });
      const equipmentResult = await tx.equipment.updateMany({
        where: { siteId, status: "ACTIVE" },
        data: { status: "DEACTIVATED" },
      });
      return { updated, equipmentCount: equipmentResult.count };
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "SITE_DEACTIVATE",
      entityType: "Site",
      entityId: siteId,
      before,
      after: { ...result.updated, cascadedEquipment: result.equipmentCount, reason: parsed.data.reason },
      request,
    });
    return successResponse(result.updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
