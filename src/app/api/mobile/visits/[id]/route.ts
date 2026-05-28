/**
 * GET /api/mobile/visits/[id]
 *
 * TECHNICIAN-only. Detail view of a visit the technician participates in
 * (as lead OR collaborator). 404 otherwise (not 403 — opaque).
 */

import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const visit = await VisitWorkflow.getById(params.id);
    if (!VisitWorkflow.access.canTechnicianView(auth, visit)) {
      throw new NotFoundError("Visit not found");
    }
    const collaborators = await VisitWorkflow.loadCollaborators(
      visit.collaboratorTechnicianIds,
    );
    return { ...visit, collaborators };
  },
});
