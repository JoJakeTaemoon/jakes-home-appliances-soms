/**
 * POST /api/mobile/visits/[id]/start
 *
 * Lead-only. Flip a SCHEDULED visit to IN_PROGRESS.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "field",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  params: paramsSchema,
  handler: async ({ auth, params, request }) => {
    const current = await VisitWorkflow.getById(params.id);
    if (!VisitWorkflow.access.canTechnicianView(auth, current)) {
      throw new NotFoundError("Visit not found");
    }
    if (!VisitWorkflow.access.canStart(auth, current)) {
      throw new ForbiddenError("Only the lead technician can start a visit");
    }
    return VisitWorkflow.start(
      params.id,
      { userId: auth.userId, role: auth.role },
      request,
    );
  },
});
