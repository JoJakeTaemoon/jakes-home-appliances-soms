/**
 * PATCH /api/customers/[id]/sites/[siteId] — update site fields.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageSite } from "@/lib/customers/access";
import { updateSiteSchema } from "@/lib/validators/site";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string; siteId: string }>;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageSite(auth.role)) throw new ForbiddenError("Cannot manage sites");
    const { id: customerId, siteId } = await ctx.params;

    const before = await prisma.site.findFirst({ where: { id: siteId, customerId } });
    if (!before) throw new NotFoundError("Site not found");

    const body = await request.json().catch(() => null);
    const parsed = updateSiteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid site payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const updated = await prisma.site.update({
      where: { id: siteId },
      data: parsed.data,
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "SITE_UPDATE",
      entityType: "Site",
      entityId: siteId,
      before,
      after: updated,
      request,
    });
    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
