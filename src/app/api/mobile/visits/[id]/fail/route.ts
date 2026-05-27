/**
 * POST /api/mobile/visits/[id]/fail (UC-VS-09)
 *
 * Lead can mark a visit FAILED_NO_SHOW. Captures reason + optional photos
 * (evidence). The office will see the FAILED state in the dashboard for
 * follow-up.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  canFailVisit,
  canTechnicianViewVisit,
} from "@/lib/visits/access";
import { failVisitSchema } from "@/lib/validators/visit";
import {
  planVisitTransition,
  IllegalVisitTransitionError,
  type VisitState,
} from "@/lib/visits/state";
import { logAudit } from "@/lib/audit";
import { getVisitOr404 } from "@/lib/visits/queries";
import type { Prisma } from "@/generated/prisma/client";

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
    if (!canFailVisit(auth, current)) {
      throw new ForbiddenError("Cannot mark this visit as failed");
    }

    const body = await request.json().catch(() => null);
    const parsed = failVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid fail payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    let plan;
    try {
      plan = planVisitTransition(
        current.state as VisitState,
        "FAILED_NO_SHOW",
        { reason: parsed.data.reason },
      );
    } catch (err) {
      if (err instanceof IllegalVisitTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }

    // Append the evidence photos to existing visit.photos (if any)
    const existing = Array.isArray(current.photos) ? (current.photos as unknown[]) : [];
    const newPhotos = parsed.data.photos.map((p) => ({
      storageKey: p.storageKey,
      takenAt: p.takenAt ? p.takenAt.toISOString() : undefined,
    }));
    const photosJson = [...existing, ...newPhotos] as unknown as Prisma.InputJsonValue;

    const updated = await prisma.visit.update({
      where: { id },
      data: {
        ...plan,
        failureReason: parsed.data.reason,
        photos: photosJson,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_FAIL",
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
