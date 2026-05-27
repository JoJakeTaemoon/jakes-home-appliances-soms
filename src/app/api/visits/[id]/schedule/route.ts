/**
 * POST /api/visits/[id]/schedule (UC-VS-02)
 *
 * Confirm a SUGGESTED visit by assigning a lead technician (+ optional
 * collaborators) and transitioning to SCHEDULED. Office (STAFF+) only.
 * Side effect: D-1 SMS reminder is queued (handled later by cron — we
 * just flip state here).
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { scheduleVisitSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.canReassign(auth.role)) {
      throw new ForbiddenError("Cannot schedule visits");
    }
  },
  params: paramsSchema,
  body: scheduleVisitSchema,
  handler: ({ auth, body, params, request }) =>
    VisitWorkflow.schedule(
      params.id,
      {
        leadTechnicianId: body.leadTechnicianId,
        collaboratorTechnicianIds: body.collaboratorTechnicianIds,
        scheduledFor: body.scheduledFor ?? null,
        scheduledWindow: body.scheduledWindow ?? null,
      },
      { userId: auth.userId, role: auth.role },
      request,
    ),
});
