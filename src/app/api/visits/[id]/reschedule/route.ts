/**
 * POST /api/visits/[id]/reschedule (UC-VS-08)
 *
 * Office-only. Move a SCHEDULED / FAILED_NO_SHOW / RESCHEDULED visit to a new
 * date+time. Resets state to SCHEDULED so the D-1 reminder cron picks it up
 * again. AuditLog records the old + new scheduledFor + reason.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canReassign } from "@/lib/visits/access";
import { rescheduleVisitSchema } from "@/lib/validators/visit";
import { logAudit } from "@/lib/audit";
import { getVisitOr404 } from "@/lib/visits/queries";

interface Ctx {
  params: Promise<{ id: string }>;
}

const ALLOWED_FROM = ["SCHEDULED", "FAILED_NO_SHOW", "RESCHEDULED"] as const;

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canReassign(auth.role)) {
      throw new ForbiddenError("Cannot reschedule visits");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = rescheduleVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid reschedule payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const current = await getVisitOr404(id);
    if (!(ALLOWED_FROM as readonly string[]).includes(current.state)) {
      throw new ValidationError(
        `Cannot reschedule in state ${current.state}`,
      );
    }

    const updated = await prisma.visit.update({
      where: { id },
      data: {
        state: "SCHEDULED",
        scheduledFor: data.scheduledFor,
        scheduledWindow: data.scheduledWindow ?? null,
        failureReason: null,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_RESCHEDULE",
      entityType: "Visit",
      entityId: id,
      before: {
        state: current.state,
        scheduledFor: current.scheduledFor,
        scheduledWindow: current.scheduledWindow,
      },
      after: {
        state: updated.state,
        scheduledFor: updated.scheduledFor,
        scheduledWindow: updated.scheduledWindow,
        reason: data.reason,
      },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
