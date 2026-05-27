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

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { cancelServiceRequestSchema } from "@/lib/validators/serviceRequest";
import { cancelServiceRequest } from "@/lib/service-requests/operations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireCustomerAuth(request);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = cancelServiceRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const sr = await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        visit: { select: { id: true, state: true, scheduledFor: true } },
      },
    });
    if (!sr || sr.customerId !== caller.customerId) {
      throw new NotFoundError("Service request not found");
    }

    // Permission: submitter OR contract party OR primary OPS.
    let allowed = caller.contactId === sr.contactId;
    if (!allowed) {
      if (caller.role === "CONTRACT_PARTY") allowed = true;
    }
    if (!allowed) {
      // primary OPS of customer scope
      const primary = await prisma.customerContact.findFirst({
        where: {
          customerId: caller.customerId,
          role: "OPS_CONTACT",
          scope: "CUSTOMER",
          isPrimary: true,
        },
        select: { id: true },
      });
      if (primary && primary.id === caller.contactId) allowed = true;
    }
    if (!allowed) {
      throw new ForbiddenError("You cannot cancel this service request");
    }

    // State guards
    if (sr.state === "REJECTED" || sr.state === "CANCELLED" || sr.state === "COMPLETED") {
      throw new ConflictError(`Cannot cancel SR in state ${sr.state}`);
    }
    if (sr.state === "SCHEDULED" && sr.visit?.scheduledFor) {
      if (sr.visit.scheduledFor.getTime() <= Date.now()) {
        throw new ConflictError("Cannot cancel a visit that has already started");
      }
    }

    const result = await cancelServiceRequest({
      serviceRequestId: id,
      reason: parsed.data.reason ?? null,
      actor: {
        actorType: "CUSTOMER",
        actorContactId: caller.contactId,
      },
    });

    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
