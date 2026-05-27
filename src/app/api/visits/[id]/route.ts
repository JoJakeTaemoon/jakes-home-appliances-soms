/**
 * GET   /api/visits/[id] — full detail (office + own-visit technician)
 * PATCH /api/visits/[id] — update non-state metadata (SUGGESTED / SCHEDULED only)
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import {
  ForbiddenError,
  ValidationError,
} from "@/lib/api/error";
import {
  canEditVisitMeta,
  canViewVisit,
} from "@/lib/visits/access";
import { updateVisitSchema } from "@/lib/validators/visit";
import { logAudit } from "@/lib/audit";
import { getVisitOr404, loadCollaborators } from "@/lib/visits/queries";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    const { id } = await ctx.params;

    const visit = await getVisitOr404(id);
    if (!canViewVisit(auth, visit)) {
      throw new ForbiddenError("Cannot view this visit");
    }

    const collaborators = await loadCollaborators(visit.collaboratorTechnicianIds);
    return successResponse({ ...visit, collaborators });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canEditVisitMeta(auth.role)) {
      throw new ForbiddenError("Cannot edit visit metadata");
    }
    const { id } = await ctx.params;

    const current = await getVisitOr404(id);
    if (current.state !== "SUGGESTED" && current.state !== "SCHEDULED") {
      throw new ValidationError(
        `Cannot edit metadata in state ${current.state}`,
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid visit payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    // Cross-field validation: site + equipment belong to the customer.
    if (data.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: data.siteId },
        select: { customerId: true },
      });
      if (!site || site.customerId !== current.customerId) {
        throw new ValidationError("Site does not belong to customer");
      }
    }
    if (data.equipmentId) {
      const eq = await prisma.equipment.findUnique({
        where: { id: data.equipmentId },
        select: { customerId: true },
      });
      if (!eq || eq.customerId !== current.customerId) {
        throw new ValidationError("Equipment does not belong to customer");
      }
    }

    const updated = await prisma.visit.update({
      where: { id },
      data: {
        type: data.type ?? undefined,
        scheduledWindow: data.scheduledWindow ?? undefined,
        expectedAmount:
          data.expectedAmount === undefined ? undefined : data.expectedAmount,
        siteId: data.siteId === undefined ? undefined : data.siteId,
        equipmentId:
          data.equipmentId === undefined ? undefined : data.equipmentId,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_UPDATE",
      entityType: "Visit",
      entityId: id,
      before: {
        type: current.type,
        siteId: current.siteId,
        equipmentId: current.equipmentId,
      },
      after: {
        type: updated.type,
        siteId: updated.siteId,
        equipmentId: updated.equipmentId,
      },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
