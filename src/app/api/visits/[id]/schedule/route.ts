/**
 * POST /api/visits/[id]/schedule (UC-VS-02)
 *
 * Confirm a SUGGESTED visit by assigning a lead technician (+ optional
 * collaborators) and transitioning to SCHEDULED. Office (STAFF+) only.
 * Side effect: D-1 SMS reminder is queued (handled later by cron — we
 * just flip state here).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canReassign } from "@/lib/visits/access";
import { scheduleVisitSchema } from "@/lib/validators/visit";
import {
  planVisitTransition,
  IllegalVisitTransitionError,
  type VisitState,
} from "@/lib/visits/state";
import { logAudit } from "@/lib/audit";
import { getVisitOr404 } from "@/lib/visits/queries";
import { markScheduledFromVisit } from "@/lib/service-requests/operations";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canReassign(auth.role)) {
      throw new ForbiddenError("Cannot schedule visits");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = scheduleVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid schedule payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const current = await getVisitOr404(id);

    // Lead must be a TECHNICIAN role + ACTIVE.
    const lead = await prisma.user.findUnique({
      where: { id: data.leadTechnicianId },
      select: { id: true, role: true, status: true, username: true },
    });
    if (!lead || lead.role !== "TECHNICIAN" || lead.status !== "ACTIVE") {
      throw new ValidationError("Lead must be an active TECHNICIAN user");
    }
    // De-dupe: lead cannot also be a collaborator.
    const collab = data.collaboratorTechnicianIds.filter(
      (cid) => cid !== data.leadTechnicianId,
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

    let plannedUpdate;
    try {
      plannedUpdate = planVisitTransition(
        current.state as VisitState,
        "SCHEDULED",
      );
    } catch (err) {
      if (err instanceof IllegalVisitTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }

    const updated = await prisma.visit.update({
      where: { id },
      data: {
        ...plannedUpdate,
        leadTechnicianId: data.leadTechnicianId,
        collaboratorTechnicianIds: collab,
        scheduledFor: data.scheduledFor ?? undefined,
        scheduledWindow: data.scheduledWindow ?? undefined,
      },
    });

    // If this visit was spawned from a free SR, lift the SR APPROVED → SCHEDULED.
    if (current.serviceRequestId) {
      try {
        await markScheduledFromVisit(current.serviceRequestId);
      } catch (err) {
        console.error("[visits/schedule] SR lift failed:", err);
      }
    }

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_SCHEDULE",
      entityType: "Visit",
      entityId: id,
      before: {
        state: current.state,
        leadTechnicianId: current.leadTechnicianId,
        collaboratorTechnicianIds: current.collaboratorTechnicianIds,
      },
      after: {
        state: updated.state,
        leadTechnicianId: updated.leadTechnicianId,
        collaboratorTechnicianIds: updated.collaboratorTechnicianIds,
        scheduledFor: updated.scheduledFor,
      },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
