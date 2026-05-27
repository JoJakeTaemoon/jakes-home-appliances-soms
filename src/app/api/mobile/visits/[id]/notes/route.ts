/**
 * POST /api/mobile/visits/[id]/notes
 *
 * Both lead and collaborators (and office) can append a note + photos to a
 * visit. Notes are appended to `findings` with a timestamp + author tag;
 * photos are appended to the photos array. Does NOT change state.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { addNotesSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  params: paramsSchema,
  body: addNotesSchema,
  handler: async ({ auth, body, params, request }) => {
    const current = await VisitWorkflow.getById(params.id);
    if (!VisitWorkflow.access.canTechnicianView(auth, current)) {
      throw new NotFoundError("Visit not found");
    }
    if (!VisitWorkflow.access.canAddNotes(auth, current)) {
      throw new ForbiddenError("Cannot add notes to this visit");
    }
    if (!body.note && body.photos.length === 0) {
      throw new ValidationError("note or photos required");
    }
    const authorLabel = `[${new Date().toISOString().slice(0, 16).replace("T", " ")}] ${auth.username}`;
    return VisitWorkflow.addNotes(
      params.id,
      {
        note: body.note,
        photos: body.photos,
        authorLabel,
      },
      { userId: auth.userId, role: auth.role },
      request,
    );
  },
});
