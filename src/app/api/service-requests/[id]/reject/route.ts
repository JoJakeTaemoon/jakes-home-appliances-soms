/**
 * POST /api/service-requests/[id]/reject — UC-SR-03.
 *
 * STAFF+ allowed. Body: `{ reason, customerMessage? }`. State → REJECTED;
 * queues `SMS_SR_REJECTED` to the submitter.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/api/error";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";
import { rejectServiceRequestSchema } from "@/lib/validators/serviceRequest";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!ServiceRequestWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
  },
  params: paramsSchema,
  body: rejectServiceRequestSchema,
  handler: async ({ auth, body, params }) => {
    const current = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
      select: { state: true },
    });
    if (!current) throw new NotFoundError("Service request not found");
    if (current.state !== "PENDING_REVIEW") {
      throw new ConflictError(
        `Service request cannot be rejected from state ${current.state}`,
      );
    }

    return ServiceRequestWorkflow.reject({
      serviceRequestId: params.id,
      input: body,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
  },
});
