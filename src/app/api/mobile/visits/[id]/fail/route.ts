/**
 * POST /api/mobile/visits/[id]/fail (UC-VS-09)
 *
 * Lead can mark a visit FAILED_NO_SHOW. Captures reason + optional photos
 * (evidence). The office will see the FAILED state in the dashboard for
 * follow-up.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { failVisitSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  params: paramsSchema,
  body: failVisitSchema,
  handler: async ({ auth, body, params, request }) => {
    const current = await VisitWorkflow.getById(params.id);
    if (!VisitWorkflow.access.canTechnicianView(auth, current)) {
      throw new NotFoundError("Visit not found");
    }
    if (!VisitWorkflow.access.canFail(auth, current)) {
      throw new ForbiddenError("Cannot mark this visit as failed");
    }
    return VisitWorkflow.fail(
      params.id,
      { reason: body.reason, photos: body.photos },
      { userId: auth.userId, role: auth.role },
      request,
    );
  },
});
