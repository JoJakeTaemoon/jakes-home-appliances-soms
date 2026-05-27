/**
 * POST /api/service-requests/[id]/approve — UC-SR-02.
 *
 * MANAGER+ only. Body: `{ approvedPrice, approvedDate, scheduledFor?,
 * scheduledWindow?, leadTechnicianId?, notes? }`. Sets SR state APPROVED
 * (or SCHEDULED if a lead is picked), creates a linked Visit, and queues
 * `SMS_SR_APPROVED` + `EMAIL_SR_APPROVED_DETAILS`.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/api/error";
import { approveServiceRequestSchema } from "@/lib/validators/serviceRequest";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
      throw new ForbiddenError("Insufficient role");
    }
  },
  params: paramsSchema,
  body: approveServiceRequestSchema,
  handler: async ({ auth, body, params }) => {
    const current = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
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

    return ServiceRequestWorkflow.approve({
      serviceRequestId: params.id,
      input: body,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
  },
});
