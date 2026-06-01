/**
 * GET /api/auth/field/me
 *
 * Returns the current authenticated technician. Uses the field-realm
 * access token from either the Authorization: Bearer header or the
 * fieldAccessToken cookie.
 */

import { NextRequest } from "next/server";
import {
  fieldRealm,
  FIELD_ACCESS_COOKIE,
} from "@/lib/auth/realms/field-realm";
import {
  successResponse,
  errorResponse,
  toErrorResponse,
} from "@/lib/api/response";

function bearerFromHeader(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const token =
      bearerFromHeader(request) ??
      request.cookies.get(FIELD_ACCESS_COOKIE)?.value ??
      null;
    if (!token) {
      return errorResponse("Not authenticated", 401, "NOT_AUTHENTICATED");
    }
    const actor = await fieldRealm.hydrateFromAccessToken(token);
    if (!actor) {
      return errorResponse("Not authenticated", 401, "NOT_AUTHENTICATED");
    }
    return successResponse({
      user: {
        id: actor.userId,
        username: actor.username,
        email: actor.email,
        phone: actor.phone,
        role: actor.role,
        mustChangePassword: actor.mustChangePassword,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
