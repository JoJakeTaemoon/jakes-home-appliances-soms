/**
 * POST /api/visits/[id]/reschedule (UC-VS-08)
 *
 * Office-only. Move a SCHEDULED / FAILED_NO_SHOW / RESCHEDULED visit to a new
 * date+time. Resets state to SCHEDULED so the D-1 reminder cron picks it up
 * again. AuditLog records the old + new scheduledFor + reason.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { rescheduleVisitSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.canReassign(auth.role)) {
      throw new ForbiddenError("Cannot reschedule visits");
    }
  },
  params: paramsSchema,
  body: rescheduleVisitSchema,
  handler: ({ auth, body, params, request }) =>
    VisitWorkflow.reschedule(
      params.id,
      {
        scheduledFor: body.scheduledFor,
        scheduledWindow: body.scheduledWindow,
        reason: body.reason,
      },
      { userId: auth.userId, role: auth.role },
      request,
    ),
});
