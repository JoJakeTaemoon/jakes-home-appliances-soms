/**
 * POST /api/auth/field/logout
 *
 * Revokes the current field refresh-token session and clears the field
 * cookies. Idempotent — calling without a session still clears cookies
 * and returns 200.
 */

import { NextRequest } from "next/server";
import {
  fieldRealm,
  FIELD_REFRESH_COOKIE,
} from "@/lib/auth/realms/field-realm";
import {
  findValidSession as coreFindValidSession,
  revokeSession as coreRevokeSession,
} from "@/lib/auth/core/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(FIELD_REFRESH_COOKIE)?.value;
    let userId: string | null = null;

    if (refreshToken) {
      try {
        const claims = await verifyRefreshToken(refreshToken, "field");
        userId = claims.sub;
      } catch {
        // ignore — proceed to clear cookies
      }

      const session = await coreFindValidSession(fieldRealm, refreshToken);
      if (session) {
        await coreRevokeSession(fieldRealm, refreshToken);
        userId ??= session.actorId;
      }
    }

    if (userId) {
      await logAudit({
        actorType: "USER",
        actorId: userId,
        action: "LOGOUT",
        entityType: "User",
        entityId: userId,
        after: { realm: "field" },
        request,
      });
    }

    const res = successResponse({ ok: true });
    fieldRealm.clearCookies(res);
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
