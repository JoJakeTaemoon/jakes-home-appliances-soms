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
import { getHqPhone } from "@/lib/settings";

const paramsSchema = z.object({ id: z.string() });

type VisitWithCustomer = Awaited<ReturnType<typeof VisitWorkflow.getById>>;

/**
 * Redact customer contact phone + email before sending to a technician.
 * Technicians never contact customers directly — they call HQ instead. The
 * contact name is kept so the technician knows who to ask the office about.
 */
function stripContactPhones(
  customer: VisitWithCustomer["customer"],
): VisitWithCustomer["customer"] {
  return {
    ...customer,
    contacts: customer.contacts.map((c) => ({ ...c, phone1: "", email: null })),
  };
}

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
    // HQ phone for the "Call HQ" action — admin-editable, so it ships with the
    // payload rather than a client-baked constant.
    const hqPhone = await getHqPhone();
    return {
      ...visit,
      customer: stripContactPhones(visit.customer),
      collaborators,
      hqPhone,
    };
  },
});
