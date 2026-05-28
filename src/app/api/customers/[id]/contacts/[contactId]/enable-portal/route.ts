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

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { canManageContact } from "@/lib/customers/access";
import { enablePortalAccount } from "@/lib/auth/portal-enable";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string(), contactId: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageContact(auth.role)) {
      throw new ForbiddenError("Cannot manage contacts");
    }
  },
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const { id: customerId, contactId } = params;
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
    return { ok: true, contactId };
  },
});
