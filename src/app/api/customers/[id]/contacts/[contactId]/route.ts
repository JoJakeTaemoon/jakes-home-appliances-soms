/**
 * PATCH  /api/customers/[id]/contacts/[contactId]
 * DELETE /api/customers/[id]/contacts/[contactId]  (soft — disables portal)
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canEditContractParty, canManageContact } from "@/lib/customers/access";
import { updateContactSchema } from "@/lib/validators/customerContact";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string; contactId: string }>;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageContact(auth.role)) throw new ForbiddenError("Cannot manage contacts");
    const { id: customerId, contactId } = await ctx.params;

    const before = await prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
    });
    if (!before) throw new NotFoundError("Contact not found");

    // CONTRACT_PARTY edits require MANAGER+
    if (before.role === "CONTRACT_PARTY" && !canEditContractParty(auth.role)) {
      throw new ForbiddenError("MANAGER+ required to edit Contract Party");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid contact payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      // If toggling primary OPS, demote others in scope.
      if (data.isPrimary && before.role === "OPS_CONTACT") {
        await tx.customerContact.updateMany({
          where: before.scope === "SITE"
            ? { customerId, siteId: before.siteId ?? undefined, role: "OPS_CONTACT", isPrimary: true, id: { not: contactId } }
            : { customerId, scope: "CUSTOMER", role: "OPS_CONTACT", isPrimary: true, id: { not: contactId } },
          data: { isPrimary: false },
        });
      }
      return tx.customerContact.update({
        where: { id: contactId },
        data: {
          name: data.name,
          title: data.title,
          phone1: data.phone1,
          phone2: data.phone2,
          email: data.email,
          language: data.language,
          isPrimary: before.role === "OPS_CONTACT" ? data.isPrimary : undefined,
          smsOptOut: data.smsOptOut,
          emailOptOut: data.emailOptOut,
        },
      });
    });

    const action =
      before.role === "CONTRACT_PARTY"
        ? "CONTRACT_PARTY_UPDATE"
        : "CUSTOMER_CONTACT_UPDATE";

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action,
      entityType: "CustomerContact",
      entityId: contactId,
      before,
      after: updated,
      request,
    });

    return successResponse({
      ...updated,
      _warnings: before.role === "CONTRACT_PARTY"
        ? ["Contract Party changed — outstanding contracts may need reissue in Phase 3."]
        : [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageContact(auth.role)) throw new ForbiddenError("Cannot manage contacts");
    const { id: customerId, contactId } = await ctx.params;

    const before = await prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
    });
    if (!before) throw new NotFoundError("Contact not found");

    if (before.role === "CONTRACT_PARTY") {
      throw new ValidationError("Cannot delete CONTRACT_PARTY — assign a new one instead");
    }

    // Soft-disable: turn off portal + primary, keep row for history.
    const updated = await prisma.customerContact.update({
      where: { id: contactId },
      data: {
        portalEnabled: false,
        isPrimary: false,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
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
