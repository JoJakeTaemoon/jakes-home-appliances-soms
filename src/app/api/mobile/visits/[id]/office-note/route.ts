/**
 * POST /api/mobile/visits/[id]/office-note
 *
 * Technician → HQ relay message (방문 전달사항). Technicians never contact
 * customers directly, so instead of a customer phone they leave handoff notes
 * here for the office. Lead + collaborators may post; does NOT change state and
 * never appears on the customer-facing work-confirmation PDF.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { officeNoteSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "field",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  params: paramsSchema,
  body: officeNoteSchema,
  handler: async ({ auth, body, params, request }) => {
    const current = await VisitWorkflow.getById(params.id);
    if (!VisitWorkflow.access.canTechnicianView(auth, current)) {
      throw new NotFoundError("Visit not found");
    }
    if (!VisitWorkflow.access.canAddNotes(auth, current)) {
      throw new ForbiddenError("Cannot add a handoff note to this visit");
    }
    return VisitWorkflow.addOfficeNote(
      params.id,
      { text: body.text, author: { id: auth.userId, name: auth.username } },
      { userId: auth.userId, role: auth.role },
      request,
    );
  },
});
