/**
 * Self-service password change for the User-backed realms (office + field).
 * Mirrors POST /api/portal/auth/change-password: verify the current password,
 * min 8, refuse re-use, clear `mustChangePassword` (set by an admin reset),
 * revoke every session for the user and mint a fresh one for the caller so
 * they stay signed in.
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import type { AuthRealm } from "@/lib/auth/realm";
import { requireAuth } from "@/lib/auth/core/guards";
import { createSession, revokeAllSessionsForActor } from "@/lib/auth/core/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validators/auth";
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

export async function changeOwnPassword<TActor extends { userId: string }>(
  realm: AuthRealm<TActor>,
  request: NextRequest,
) {
  try {
    const caller = await requireAuth(realm, request);
    const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
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
    const realmTag = { realm: realm.audience === "field" ? "field" : "office" };

    const row = await prisma.user.findUnique({
      where: { id: caller.userId },
      select: { passwordHash: true },
    });
    if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
      await logAudit({
        actorType: "USER",
        actorId: caller.userId,
        action: "PASSWORD_CHANGE_FAILED",
        entityType: "User",
        entityId: caller.userId,
        after: { ...realmTag, reason: "WRONG_CURRENT" },
        request,
      });
      return errorResponse("Current password is incorrect", 400, "WRONG_PASSWORD");
    }
    if (currentPassword === newPassword) {
      return errorResponse(
        "New password must differ from the current password",
        400,
        "PASSWORD_REUSE",
      );
    }

    await prisma.user.update({
      where: { id: caller.userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await revokeAllSessionsForActor(realm, caller.userId);
    const session = await createSession(realm, {
      actorId: caller.userId,
      userAgent: request.headers.get("user-agent"),
      ipAddress: clientIp(request),
    });
    const accessToken = await realm.signAccessToken(caller);

    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: caller.userId,
      after: { ...realmTag, otherSessionsRevoked: true, newSessionId: session.sessionId },
      request,
    });

    const res = successResponse({ ok: true });
    realm.setCookies(res, { accessToken, refreshToken: session.refreshToken });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
