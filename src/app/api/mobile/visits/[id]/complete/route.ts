/**
 * POST /api/mobile/visits/[id]/complete (UC-VS-06)
 *
 * Lead-only. Submit findings + parts + photos + signature + optional cash
 * collection. Transitions to COMPLETED, renders the work-confirmation PDF,
 * and queues EMAIL_VISIT_COMPLETED.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  VisitWorkflow,
  IllegalVisitTransitionError,
} from "@/lib/visits/workflow";
import { completeVisitSchema } from "@/lib/validators/visit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  params: paramsSchema,
  body: completeVisitSchema,
  handler: async ({ auth, body, params }) => {
    const visit = await VisitWorkflow.getById(params.id);
    if (!VisitWorkflow.access.canTechnicianView(auth, visit)) {
      throw new NotFoundError("Visit not found");
    }
    if (!VisitWorkflow.access.canComplete(auth, visit)) {
      throw new ForbiddenError(
        "Only the lead technician can complete the visit",
      );
    }

    const lang =
      visit.customer.contacts.find((c) => c.isPrimary)?.language ??
      visit.customer.contacts[0]?.language ??
      "vi";

    try {
      return await VisitWorkflow.complete({
        visitId: params.id,
        actorUserId: auth.userId,
        input: body,
        locale: lang,
      });
    } catch (err) {
      if (err instanceof IllegalVisitTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  },
});
