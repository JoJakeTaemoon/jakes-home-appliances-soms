/**
 * POST /api/portal/auth/change-password
 *
 * Authenticated portal user changes their own password. Verifies currentPassword,
 * enforces strength rule (min 8), updates hash, clears `mustChangePassword`.
 * Records audit. Revokes every existing CustomerSession for this contact
 * (so any concurrent attacker session loses access) and mints a fresh
 * session for the caller in the same response so the legitimate user stays
 * logged in seamlessly.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { portalChangePasswordSchema } from "@/lib/validators/portalAuth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createCustomerSession,
  revokeAllCustomerSessions,
} from "@/lib/auth/customer-session";
import { setCustomerAuthCookies } from "@/lib/auth/customer-cookies";
import { signCustomerAccessToken } from "@/lib/auth/jwt";
import { successResponse, errorResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

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

    // Revoke every active session for this contact (kills any concurrent
    // attacker session) and immediately mint a fresh session for the caller
    // so they don't get bounced back to the login screen. The caller's old
    // refresh-token cookie is now revoked; the new cookies set below replace
    // it.
    await revokeAllCustomerSessions(caller.contactId);
    const session = await createCustomerSession({
      contactId: caller.contactId,
      userAgent: request.headers.get("user-agent"),
      ipAddress: clientIp(request),
    });
    const accessToken = await signCustomerAccessToken({
      contactId: caller.contactId,
      customerId: caller.customerId,
      contactRole: caller.role,
    });

    await logAudit({
      actorType: "CUSTOMER",
      actorId: caller.contactId,
      action: "PORTAL_PASSWORD_CHANGED",
      entityType: "CustomerContact",
      entityId: caller.contactId,
      after: { siblingSessionsRevoked: true, newSessionId: session.sessionId },
      request,
    });

    const res = successResponse({ ok: true });
    setCustomerAuthCookies(res, {
      accessToken,
      refreshToken: session.refreshToken,
    });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
