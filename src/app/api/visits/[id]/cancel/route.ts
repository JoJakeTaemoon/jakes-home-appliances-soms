/**
 * POST /api/visits/[id]/cancel
 *
 * Office (STAFF+) only. Cancel a visit before it starts. Logs reason.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canReassign } from "@/lib/visits/access";
import { cancelVisitSchema } from "@/lib/validators/visit";
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
    if (!canReassign(auth.role)) {
      throw new ForbiddenError("Cannot cancel visits");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = cancelVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid cancel payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const current = await getVisitOr404(id);
    let plan;
    try {
      plan = planVisitTransition(
        current.state as VisitState,
        "CANCELLED",
        { reason: parsed.data.reason },
      );
    } catch (err) {
      if (err instanceof IllegalVisitTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
    const updated = await prisma.visit.update({
      where: { id },
      data: { ...plan, failureReason: parsed.data.reason },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_CANCEL",
      entityType: "Visit",
      entityId: id,
      before: { state: current.state },
      after: { state: updated.state, reason: parsed.data.reason },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
