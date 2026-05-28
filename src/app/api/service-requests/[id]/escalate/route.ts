/**
 * POST /api/service-requests/[id]/escalate — UC-SR-06 hook.
 *
 * MANAGER+ only. Sets an `SR_ESCALATE` audit row that the manager dashboard
 * can read. Full automation (cron-based escalation when PENDING_REVIEW > 1
 * business day) lands in Phase 7.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { escalateServiceRequestSchema } from "@/lib/validators/serviceRequest";
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
  body: escalateServiceRequestSchema,
  handler: async ({ auth, body, params }) => {
    const current = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
      select: { state: true },
    });
    if (!current) throw new NotFoundError("Service request not found");

    await ServiceRequestWorkflow.escalate({
      serviceRequestId: params.id,
      reason: body.reason ?? null,
      actor: { actorType: "USER", actorUserId: auth.userId },
    });
    return { serviceRequestId: params.id, escalated: true };
  },
});
