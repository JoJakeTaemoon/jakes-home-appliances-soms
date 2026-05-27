/**
 * POST /api/service-requests/[id]/reject — UC-SR-03.
 *
 * STAFF+ allowed. Body: `{ reason, customerMessage? }`. State → REJECTED;
 * queues `SMS_SR_REJECTED` to the submitter.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { isOfficeRole } from "@/lib/visits/access";
import { rejectServiceRequestSchema } from "@/lib/validators/serviceRequest";
import { rejectServiceRequest } from "@/lib/service-requests/operations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = rejectServiceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid rejection payload",
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
    if (current.state !== "PENDING_REVIEW") {
      throw new ConflictError(
        `Service request cannot be rejected from state ${current.state}`,
      );
    }

    const result = await rejectServiceRequest({
      serviceRequestId: id,
      input: parsed.data,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
