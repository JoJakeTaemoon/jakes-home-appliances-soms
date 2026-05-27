/**
 * POST /api/visits/[id]/cancel
 *
 * Office (STAFF+) only. Cancel a visit before it starts. Logs reason.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { cancelVisitSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.canReassign(auth.role)) {
      throw new ForbiddenError("Cannot cancel visits");
    }
  },
  params: paramsSchema,
  body: cancelVisitSchema,
  handler: ({ auth, body, params, request }) =>
    VisitWorkflow.cancel(
      params.id,
      body.reason,
      { userId: auth.userId, role: auth.role },
      request,
    ),
});
