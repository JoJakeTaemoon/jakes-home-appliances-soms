/**
 * POST /api/portal/auth/change-password
 *
 * Authenticated portal user changes their own password. Verifies currentPassword,
 * enforces strength rule (min 8), updates hash, clears `mustChangePassword`.
 * Records audit. Does NOT rotate session (the user keeps their cookies).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { portalChangePasswordSchema } from "@/lib/validators/portalAuth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { successResponse, errorResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);
    const body = await request.json().catch(() => null);
    const parsed = portalChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { currentPassword, newPassword } = parsed.data;

    const row = await prisma.customerContact.findUnique({
      where: { id: caller.contactId },
      select: { passwordHash: true },
    });
    if (!row?.passwordHash) {
      return errorResponse(
        "No password on file — request a reset instead",
        400,
        "NO_PASSWORD_SET",
      );
    }

    const ok = await verifyPassword(currentPassword, row.passwordHash);
    if (!ok) {
      await logAudit({
        actorType: "CUSTOMER",
        actorId: caller.contactId,
        action: "PORTAL_PASSWORD_CHANGE_FAILED",
        entityType: "CustomerContact",
        entityId: caller.contactId,
        after: { reason: "WRONG_CURRENT" },
        request,
      });
      return errorResponse(
        "Current password is incorrect",
        400,
        "WRONG_PASSWORD",
      );
    }
    if (currentPassword === newPassword) {
      return errorResponse(
        "New password must differ from the current password",
        400,
        "PASSWORD_REUSE",
      );
    }

    const newHash = await hashPassword(newPassword);
    await prisma.customerContact.update({
      where: { id: caller.contactId },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await logAudit({
      actorType: "CUSTOMER",
      actorId: caller.contactId,
      action: "PORTAL_PASSWORD_CHANGED",
      entityType: "CustomerContact",
      entityId: caller.contactId,
      request,
    });

    return successResponse({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
