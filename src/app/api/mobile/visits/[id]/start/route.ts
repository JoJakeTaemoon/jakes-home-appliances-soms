/**
 * POST /api/mobile/visits/[id]/start
 *
 * Lead-only. Flip a SCHEDULED visit to IN_PROGRESS.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  canStartVisit,
  canTechnicianViewVisit,
} from "@/lib/visits/access";
import {
  planVisitTransition,
  IllegalVisitTransitionError,
  type VisitState,
} from "@/lib/visits/state";
import { logAudit } from "@/lib/audit";
import { getVisitOr404 } from "@/lib/visits/queries";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
    const { id } = await ctx.params;
    const current = await getVisitOr404(id);
    if (!canTechnicianViewVisit(auth, current)) {
      throw new NotFoundError("Visit not found");
    }
    if (!canStartVisit(auth, current)) {
      throw new ForbiddenError("Only the lead technician can start a visit");
    }
    let plan;
    try {
      plan = planVisitTransition(
        current.state as VisitState,
        "IN_PROGRESS",
      );
    } catch (err) {
      if (err instanceof IllegalVisitTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
    const updated = await prisma.visit.update({
      where: { id },
      data: plan,
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_START",
      entityType: "Visit",
      entityId: id,
      before: { state: current.state },
      after: { state: updated.state, startedAt: updated.startedAt },
      request,
    });
    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
