/**
 * POST /api/portal/service-requests/[id]/cancel — UC-SR-05.
 *
 * Allowed roles:
 *   - The original submitter (matching contactId)
 *   - Any CONTRACT_PARTY of the same customer
 *   - The primary OPS_CONTACT of the same customer
 *
 * State gates: PENDING_REVIEW, APPROVED (not yet SCHEDULED), or SCHEDULED
 * with a future `scheduledFor`. Cascades to the linked Visit when present.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/api/error";
import { cancelServiceRequestSchema } from "@/lib/validators/serviceRequest";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "customer",
  params: paramsSchema,
  body: cancelServiceRequestSchema,
  handler: async ({ auth, body, params }) => {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
      include: {
        visit: { select: { id: true, state: true, scheduledFor: true } },
      },
    });
    if (!sr || sr.customerId !== auth.customerId) {
      throw new NotFoundError("Service request not found");
    }

    let allowed = auth.contactId === sr.contactId;
    if (!allowed && auth.role === "CONTRACT_PARTY") allowed = true;
    if (!allowed) {
      const primary = await prisma.customerContact.findFirst({
        where: {
          customerId: auth.customerId,
          role: "OPS_CONTACT",
          scope: "CUSTOMER",
          isPrimary: true,
        },
        select: { id: true },
      });
      if (primary && primary.id === auth.contactId) allowed = true;
    }
    if (!allowed) {
      throw new ForbiddenError("You cannot cancel this service request");
    }

    if (
      sr.state === "REJECTED" ||
      sr.state === "CANCELLED" ||
      sr.state === "COMPLETED"
    ) {
      throw new ConflictError(`Cannot cancel SR in state ${sr.state}`);
    }
    if (sr.state === "SCHEDULED" && sr.visit?.scheduledFor) {
      if (sr.visit.scheduledFor.getTime() <= Date.now()) {
        throw new ConflictError(
          "Cannot cancel a visit that has already started",
        );
      }
    }

    return ServiceRequestWorkflow.cancel({
      serviceRequestId: params.id,
      reason: body.reason ?? null,
      actor: {
        actorType: "CUSTOMER",
        actorContactId: auth.contactId,
      },
    });
  },
});
