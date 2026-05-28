/**
 * POST /api/visits/[id]/reassign (UC-VS-03)
 *
 * Office-only. Swap the lead and/or collaborators on a SCHEDULED visit.
 * AuditLog captures who/why. Does NOT change state.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { reassignVisitSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.canReassign(auth.role)) {
      throw new ForbiddenError("Cannot reassign visits");
    }
  },
  params: paramsSchema,
  body: reassignVisitSchema,
  handler: ({ auth, body, params, request }) =>
    VisitWorkflow.reassign(
      params.id,
      {
        leadTechnicianId: body.leadTechnicianId,
        collaboratorTechnicianIds: body.collaboratorTechnicianIds,
        reason: body.reason,
      },
      { userId: auth.userId, role: auth.role },
      request,
    ),
});
