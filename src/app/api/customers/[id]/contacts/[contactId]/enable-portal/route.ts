/**
 * POST /api/customers/[id]/contacts/[contactId]/enable-portal
 *
 * Office-initiated portal account provisioning for an existing contact. Use
 * this when the auto-enable on contact creation was skipped (no `phone1` at
 * time of creation, deferred, etc.).
 *
 * STAFF+ can enable portal accounts (matches `canManageContact`); the
 * sensitive part (CONTRACT_PARTY edit) is governed separately.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageContact } from "@/lib/customers/access";
import { enablePortalAccount } from "@/lib/auth/portal-enable";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";

interface Ctx {
  params: Promise<{ id: string; contactId: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageContact(auth.role)) {
      throw new ForbiddenError("Cannot manage contacts");
    }
    const { id: customerId, contactId } = await ctx.params;

    const contact = await prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
      select: { id: true, portalEnabled: true, phone1: true },
    });
    if (!contact) throw new NotFoundError("Contact not found");
    if (contact.portalEnabled) {
      throw new ConflictError("Portal account already enabled");
    }
    if (!contact.phone1) {
      throw new ValidationError(
        "Contact has no phone — required for SMS credential delivery",
      );
    }

    await enablePortalAccount({
      contactId,
      actorId: auth.userId,
      actorType: "USER",
    });

    return successResponse({ ok: true, contactId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
