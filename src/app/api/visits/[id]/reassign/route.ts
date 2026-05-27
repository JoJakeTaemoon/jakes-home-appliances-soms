/**
 * POST /api/visits/[id]/reassign (UC-VS-03)
 *
 * Office-only. Swap the lead and/or collaborators on a SCHEDULED visit.
 * AuditLog captures who/why. Does NOT change state.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canReassign } from "@/lib/visits/access";
import { reassignVisitSchema } from "@/lib/validators/visit";
import { logAudit } from "@/lib/audit";
import { getVisitOr404 } from "@/lib/visits/queries";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canReassign(auth.role)) {
      throw new ForbiddenError("Cannot reassign visits");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = reassignVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid reassign payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const current = await getVisitOr404(id);
    if (
      current.state !== "SCHEDULED" &&
      current.state !== "SUGGESTED" &&
      current.state !== "RESCHEDULED" &&
      current.state !== "FAILED_NO_SHOW"
    ) {
      throw new ValidationError(
        `Cannot reassign in state ${current.state}`,
      );
    }

    const newLeadId = data.leadTechnicianId ?? current.leadTechnicianId;
    if (!newLeadId) {
      throw new ValidationError("A lead technician is required");
    }

    const lead = await prisma.user.findUnique({
      where: { id: newLeadId },
      select: { id: true, role: true, status: true },
    });
    if (!lead || lead.role !== "TECHNICIAN" || lead.status !== "ACTIVE") {
      throw new ValidationError("Lead must be an active TECHNICIAN");
    }
    const collab = data.collaboratorTechnicianIds.filter(
      (cid) => cid !== newLeadId,
    );
    if (collab.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: collab }, role: "TECHNICIAN", status: "ACTIVE" },
        select: { id: true },
      });
      if (found.length !== collab.length) {
        throw new ValidationError(
          "One or more collaborators are not active TECHNICIANs",
        );
      }
    }

    const updated = await prisma.visit.update({
      where: { id },
      data: {
        leadTechnicianId: newLeadId,
        collaboratorTechnicianIds: collab,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_REASSIGN",
      entityType: "Visit",
      entityId: id,
      before: {
        leadTechnicianId: current.leadTechnicianId,
        collaboratorTechnicianIds: current.collaboratorTechnicianIds,
      },
      after: {
        leadTechnicianId: updated.leadTechnicianId,
        collaboratorTechnicianIds: updated.collaboratorTechnicianIds,
        reason: data.reason,
      },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
