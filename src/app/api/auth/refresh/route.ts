/**
 * POST /api/auth/refresh
 *
 * Reads the refreshToken cookie, rotates the session, mints a new access
 * token, and returns the access token + minimal user payload. Sets fresh
 * cookies on the response.
 *
 * Called silently by the AuthProvider on mount + on a 12-minute timer
 * (access TTL is 15 min). If the refresh fails the client falls back to
 * /login.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { REFRESH_COOKIE, setAuthCookies, clearAuthCookies } from "@/lib/auth/cookies";
import { rotateSession } from "@/lib/auth/session";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { successResponse, errorResponse, toErrorResponse } from "@/lib/api/response";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      const res = errorResponse("Missing refresh token", 401, "NO_REFRESH_TOKEN");
      clearAuthCookies(res);
      return res;
    }

    const ipAddress = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    const rotated = await rotateSession(refreshToken, {
      ipAddress,
      userAgent,
    });
    if (!rotated) {
      const res = errorResponse(
        "Invalid or expired refresh token",
        401,
        "INVALID_REFRESH_TOKEN",
      );
      clearAuthCookies(res);
      return res;
    }

    // Find owning user for the rotated session.
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
      clearAuthCookies(res);
      return res;
    }

    const accessToken = await signStaffAccessToken({
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
    setAuthCookies(res, { accessToken, refreshToken: rotated.refreshToken });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
