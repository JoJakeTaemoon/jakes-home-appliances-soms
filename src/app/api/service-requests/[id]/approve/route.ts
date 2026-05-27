/**
 * POST /api/service-requests/[id]/approve — UC-SR-02.
 *
 * MANAGER+ only. Body: `{ approvedPrice, approvedDate, scheduledFor?,
 * scheduledWindow?, leadTechnicianId?, notes? }`. Sets SR state APPROVED
 * (or SCHEDULED if a lead is picked), creates a linked Visit, and queues
 * `SMS_SR_APPROVED` + `EMAIL_SR_APPROVED_DETAILS`.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/error";
import { approveServiceRequestSchema } from "@/lib/validators/serviceRequest";
import { approveServiceRequest } from "@/lib/service-requests/operations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRole(request, ["ADMIN", "MANAGER"]);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = approveServiceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid approval payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const current = await prisma.serviceRequest.findUnique({
      where: { id },
      select: { state: true, visit: { select: { id: true } } },
    });
    if (!current) throw new NotFoundError("Service request not found");
    if (current.state !== "PENDING_REVIEW") {
      throw new ConflictError(
        `Service request cannot be approved from state ${current.state}`,
      );
    }
    if (current.visit) {
      throw new ConflictError("Visit already linked to this service request");
    }

    const result = await approveServiceRequest({
      serviceRequestId: id,
      input: parsed.data,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
