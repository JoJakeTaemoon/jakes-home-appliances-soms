/**
 * PATCH /api/portal/contacts/me — UC-PT-06.
 *
 * Logged-in portal user updates their own profile fields. Phone is locked
 * (it's the login key — change must go through the office). Email, name,
 * language, and opt-out flags are user-controllable.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { portalUpdateOwnContactSchema } from "@/lib/validators/portalAuth";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export async function PATCH(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);
    const body = await request.json().catch(() => null);
    const parsed = portalUpdateOwnContactSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid update payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const before = await prisma.customerContact.findUnique({
      where: { id: caller.contactId },
      select: {
        name: true,
        email: true,
        language: true,
        smsOptOut: true,
        emailOptOut: true,
      },
    });

    const data = parsed.data;
    const updated = await prisma.customerContact.update({
      where: { id: caller.contactId },
      data: {
        name: data.name,
        email: data.email === null ? null : data.email,
        language: data.language,
        smsOptOut: data.smsOptOut,
        emailOptOut: data.emailOptOut,
      },
      select: {
        id: true,
        name: true,
        email: true,
        language: true,
        smsOptOut: true,
        emailOptOut: true,
      },
    });

    await logAudit({
      actorType: "CUSTOMER",
      actorId: caller.contactId,
      action: "PORTAL_SELF_UPDATE",
      entityType: "CustomerContact",
      entityId: caller.contactId,
      before,
      after: updated,
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
