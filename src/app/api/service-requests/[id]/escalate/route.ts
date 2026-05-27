/**
 * POST /api/service-requests/[id]/escalate — UC-SR-06 hook.
 *
 * MANAGER+ only. Sets an `SR_ESCALATE` audit row that the manager dashboard
 * can read. Full automation (cron-based escalation when PENDING_REVIEW > 1
 * business day) lands in Phase 7.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import { escalateServiceRequestSchema } from "@/lib/validators/serviceRequest";
import { escalateServiceRequest } from "@/lib/service-requests/operations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRole(request, ["ADMIN", "MANAGER"]);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = escalateServiceRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const current = await prisma.serviceRequest.findUnique({
      where: { id },
      select: { state: true },
    });
    if (!current) throw new NotFoundError("Service request not found");

    await escalateServiceRequest({
      serviceRequestId: id,
      reason: parsed.data.reason ?? null,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
    return successResponse({ serviceRequestId: id, escalated: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
