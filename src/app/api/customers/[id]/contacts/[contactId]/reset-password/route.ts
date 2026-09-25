/**
 * POST /api/customers/[id]/contacts/[contactId]/reset-password — UC-AU-06.
 *
 * MANAGER+ resets a portal contact's password. Generates a new 10-char
 * password, hashes it, sets `mustChangePassword=true` and revokes every
 * session.
 *
 * Nothing is sent: the plain-text password comes back in the response, is
 * shown on screen once, and staff read it out on the phone. Same shape as the
 * staff reset at `/api/users/[id]/password-reset`, so a credential never
 * lands in a delivery log.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { canEditContractParty } from "@/lib/customers/access";
import { resetPortalPassword } from "@/lib/auth/portal-enable";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string(), contactId: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canEditContractParty(auth.role)) {
      throw new ForbiddenError("MANAGER+ required to reset portal passwords");
    }
  },
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const { id: customerId, contactId } = params;
    const exists = await prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError("Contact not found");

    const result = await resetPortalPassword({
      contactId,
      actorId: auth.userId,
      actorType: "USER",
    });

    return {
      contactId: result.contactId,
      tempPassword: result.plainPassword,
    };
  },
});
