/**
 * POST /api/auth/field/refresh
 *
 * Reads the fieldRefreshToken cookie, rotates the session, mints a new
 * field-audience access token, and returns it. Sets fresh field cookies.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { fieldRealm, FIELD_REFRESH_COOKIE } from "@/lib/auth/realms/field-realm";
import { rotateSession as coreRotateSession } from "@/lib/auth/core/session";
import { signFieldAccessToken } from "@/lib/auth/jwt";
import {
  successResponse,
  errorResponse,
  toErrorResponse,
} from "@/lib/api/response";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(FIELD_REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      const res = errorResponse("Missing refresh token", 401, "NO_REFRESH_TOKEN");
      fieldRealm.clearCookies(res);
      return res;
    }

    const ipAddress = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    const rotated = await coreRotateSession(fieldRealm, refreshToken, {
      ipAddress,
      userAgent,
    });
    if (!rotated) {
      const res = errorResponse(
        "Invalid or expired refresh token",
        401,
        "INVALID_REFRESH_TOKEN",
      );
      fieldRealm.clearCookies(res);
      return res;
    }

    const sessionRow = await prisma.session.findUnique({
      where: { id: rotated.sessionId },
      select: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            mustChangePassword: true,
          },
        },
      },
    });

    if (!sessionRow || sessionRow.user.status !== "ACTIVE") {
      const res = errorResponse("Account is inactive", 401, "ACCOUNT_INACTIVE");
      fieldRealm.clearCookies(res);
      return res;
    }

    // Defense in depth — a session row whose user role drifted out of
    // TECHNICIAN (e.g. demoted/promoted while the cookie was alive)
    // must not get a fresh field token.
    if (sessionRow.user.role !== "TECHNICIAN") {
      const res = errorResponse(
        "Role no longer permits the field realm",
        401,
        "ROLE_DRIFTED",
      );
      fieldRealm.clearCookies(res);
      return res;
    }

    const accessToken = await signFieldAccessToken({
      userId: sessionRow.user.id,
      username: sessionRow.user.username,
      role: sessionRow.user.role,
    });

    const res = successResponse({
      user: {
        id: sessionRow.user.id,
        username: sessionRow.user.username,
        email: sessionRow.user.email,
        phone: sessionRow.user.phone,
        role: sessionRow.user.role,
        mustChangePassword: sessionRow.user.mustChangePassword,
      },
      accessToken,
    });
    fieldRealm.setCookies(res, {
      accessToken,
      refreshToken: rotated.refreshToken,
    });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
