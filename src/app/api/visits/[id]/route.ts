/**
 * GET   /api/visits/[id] — full detail (office + own-visit technician)
 * PATCH /api/visits/[id] — update non-state metadata (SUGGESTED / SCHEDULED only)
 *
 * GET migrated to `defineQuery`. PATCH stays on the manual try/catch shape
 * because the audit row's `before:` snapshot is read from the
 * pre-update visit and the HOF cannot pass that pre-image into its
 * post-handler `audit.before` hook without a second DB round-trip — which
 * would mean an empty `before:` snapshot. Forensic fidelity wins.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { updateVisitSchema } from "@/lib/validators/visit";
import { logAudit } from "@/lib/audit";

const paramsSchema = z.object({ id: z.string() });

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const visit = await VisitWorkflow.getById(params.id);
    if (
      !VisitWorkflow.access.canView(
        { userId: auth.userId, role: auth.role },
        visit,
      )
    ) {
      throw new ForbiddenError("Cannot view this visit");
    }
    const collaborators = await VisitWorkflow.loadCollaborators(
      visit.collaboratorTechnicianIds,
    );
    return { ...visit, collaborators };
  },
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!VisitWorkflow.access.canEditMeta(auth.role)) {
      throw new ForbiddenError("Cannot edit visit metadata");
    }
    const { id } = await ctx.params;

    const current = await VisitWorkflow.getById(id);
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
