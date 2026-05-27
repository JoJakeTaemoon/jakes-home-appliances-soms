/**
 * POST /api/service-requests/[id]/cancel — office cancel.
 *
 * STAFF+ can cancel an SR in any non-terminal state. Cascades to the linked
 * Visit (CANCELLED) unless the visit is already IN_PROGRESS/COMPLETED.
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
import { cancelServiceRequestSchema } from "@/lib/validators/serviceRequest";
import { cancelServiceRequest } from "@/lib/service-requests/operations";

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
    const body = await request.json().catch(() => ({}));
    const parsed = cancelServiceRequestSchema.safeParse(body ?? {});
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
    if (
      current.state === "REJECTED" ||
      current.state === "COMPLETED" ||
      current.state === "CANCELLED"
    ) {
      throw new ConflictError(`Cannot cancel SR in state ${current.state}`);
    }

    const result = await cancelServiceRequest({
      serviceRequestId: id,
      reason: parsed.data.reason ?? null,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
