/**
 * POST /api/auth/logout
 *
 * Revokes the current refresh-token session and clears the auth cookies.
 * Idempotent — calling without a session still clears cookies and returns
 * 200 so the UI can safely fire-and-forget on logout.
 *
 * Implements UC-AU-02.
 */

import { NextRequest } from "next/server";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth/cookies";
import { findValidSession, revokeSession } from "@/lib/auth/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    let userId: string | null = null;

    if (refreshToken) {
      // Best-effort verify — if the cookie is forged or expired we still
      // clear cookies and return success. No info-leak about why logout
      // "failed" because logout should never fail visibly.
      try {
        const claims = await verifyRefreshToken(refreshToken, "staff");
        userId = claims.sub;
      } catch {
        // ignore — proceed to clear
      }

      const session = await findValidSession(refreshToken);
      if (session) {
        await revokeSession(refreshToken);
        userId ??= session.userId;
      }
    }

    if (userId) {
      await logAudit({
        actorType: "USER",
        actorId: userId,
        action: "LOGOUT",
        entityType: "User",
        entityId: userId,
        request,
      });
    }

    const res = successResponse({ ok: true });
    clearAuthCookies(res);
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
