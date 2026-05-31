/**
 * DELETE /api/portal/contacts/[contactId] — UC-PT-07.
 *
 * CONTRACT_PARTY (only) may soft-delete an OPS_CONTACT belonging to the same
 * customer. Soft-disable matches the staff endpoint: clears portal access +
 * primary/accounting flags, keeps the row for history.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireContractParty } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ contactId: string }>;
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const caller = await requireContractParty(request);
    const { contactId } = await ctx.params;

    const before = await prisma.customerContact.findFirst({
      where: { id: contactId, customerId: caller.customerId },
    });
    if (!before) throw new NotFoundError("Contact not found");

    if (before.role === "CONTRACT_PARTY") {
      throw new ValidationError("Cannot delete CONTRACT_PARTY from portal");
    }
    if (before.id === caller.contactId) {
      throw new ForbiddenError("Cannot delete yourself");
    }

    const updated = await prisma.customerContact.update({
      where: { id: contactId },
      data: {
        portalEnabled: false,
        isPrimary: false,
        isAccountingContact: false,
      },
    });

    await logAudit({
      actorType: "CUSTOMER",
      actorId: caller.contactId,
      action: "CUSTOMER_CONTACT_DISABLE",
      entityType: "CustomerContact",
      entityId: contactId,
      before,
      after: updated,
      request,
    });

    return successResponse({ disabled: true, id: contactId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
