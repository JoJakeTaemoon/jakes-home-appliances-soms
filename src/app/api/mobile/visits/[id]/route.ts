/**
 * GET /api/mobile/visits/[id]
 *
 * TECHNICIAN-only. Detail view of a visit the technician participates in
 * (as lead OR collaborator). 404 otherwise (not 403 — opaque).
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { getHqPhone } from "@/lib/settings";
import {
  suggestVisitDocumentKind,
  type CustomerTypeForSuggest,
  type VisitTypeForSuggest,
} from "@/lib/visits/document-suggest";

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
  audience: "field",
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

    // Compute the signature-required doc list + contract reference so
    // the mobile detail page can show inline previews per doc kind and
    // a contract PDF link for INSTALLATION visits — mirrors today/page
    // behaviour but with extra metadata for the per-doc preview cards.
    const latestContract = await prisma.contract.findFirst({
      where: {
        customerId: visit.customerId,
        state: { in: ["ACTIVE", "PENDING_SIGNATURE", "AMENDED"] },
      },
      orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, contractNumber: true, type: true },
    });
    const docKind = suggestVisitDocumentKind({
      visitType: visit.type as VisitTypeForSuggest,
      customerType: visit.customer.type as CustomerTypeForSuggest,
      contractType: latestContract?.type ?? null,
    });
    const signatureDocs: string[] = [docKind];
    if (visit.type === "INSTALLATION" && latestContract) {
      signatureDocs.push("CONTRACT");
    }
    return {
      ...visit,
      customer: stripContactPhones(visit.customer),
      collaborators,
      hqPhone,
      signatureDocs,
      contract:
        visit.type === "INSTALLATION" && latestContract
          ? {
              id: latestContract.id,
              contractNumber: latestContract.contractNumber,
            }
          : null,
    };
  },
});
