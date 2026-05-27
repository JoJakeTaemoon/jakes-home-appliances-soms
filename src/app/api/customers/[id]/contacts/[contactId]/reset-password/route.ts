/**
 * POST /api/customers/[id]/contacts/[contactId]/reset-password — UC-AU-06.
 *
 * MANAGER+ resets a portal contact's password. Generates a new 10-char
 * password, hashes it, sets `mustChangePassword=true`, revokes all sessions,
 * and queues SMS_PASSWORD_RESET via the notification factory (mock provider
 * in dev — eSMS in production once F.4 credentials land).
 *
 * Response payload deliberately omits the plain-text password — staff should
 * direct the customer to check their SMS. The console mock log shows the
 * password in dev for QA convenience.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canEditContractParty } from "@/lib/customers/access";
import { resetPortalPassword } from "@/lib/auth/portal-enable";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

interface Ctx {
  params: Promise<{ id: string; contactId: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    // MANAGER+ only — password reset is a sensitive admin action.
    if (!canEditContractParty(auth.role)) {
      throw new ForbiddenError("MANAGER+ required to reset portal passwords");
    }
    const { id: customerId, contactId } = await ctx.params;

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

    return successResponse({
      contactId: result.contactId,
      // Avoid returning the plain password in production responses; mock
      // provider logs it to the server console for dev convenience.
      ok: true,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
