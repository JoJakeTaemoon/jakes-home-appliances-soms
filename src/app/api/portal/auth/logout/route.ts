/**
 * POST /api/portal/auth/logout
 *
 * Revokes the current customer refresh session and clears portal cookies.
 * Idempotent — calling without a session still clears cookies + returns 200.
 */

import { NextRequest } from "next/server";
import {
  CUSTOMER_REFRESH_COOKIE,
  clearCustomerAuthCookies,
} from "@/lib/auth/customer-cookies";
import {
  findValidCustomerSession,
  revokeCustomerSession,
} from "@/lib/auth/customer-session";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(CUSTOMER_REFRESH_COOKIE)?.value;
    let contactId: string | null = null;

    if (refreshToken) {
      try {
        const claims = await verifyRefreshToken(refreshToken, "customer");
        contactId = claims.sub;
      } catch {
        // ignore — still clear cookies below
      }

      const session = await findValidCustomerSession(refreshToken);
      if (session) {
        await revokeCustomerSession(refreshToken);
        contactId ??= session.contactId;
      }
    }

    if (contactId) {
      await logAudit({
        actorType: "CUSTOMER",
        actorId: contactId,
        action: "PORTAL_LOGOUT",
        entityType: "CustomerContact",
        entityId: contactId,
        request,
      });
    }

    const res = successResponse({ ok: true });
    clearCustomerAuthCookies(res);
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
