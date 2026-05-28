/**
 * POST /api/service-requests/[id]/cancel — office cancel.
 *
 * STAFF+ can cancel an SR in any non-terminal state. Cascades to the linked
 * Visit (CANCELLED) unless the visit is already IN_PROGRESS/COMPLETED.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/api/error";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";
import { cancelServiceRequestSchema } from "@/lib/validators/serviceRequest";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!ServiceRequestWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
  },
  params: paramsSchema,
  body: cancelServiceRequestSchema,
  handler: async ({ auth, body, params }) => {
    const current = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
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

    return ServiceRequestWorkflow.cancel({
      serviceRequestId: params.id,
      reason: body.reason ?? null,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
  },
});
