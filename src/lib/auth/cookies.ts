/**
 * Standardized cookie configuration for auth tokens.
 *
 * Per CLAUDE.md: `refreshToken` cookie uses `Path=/` (not `/api/auth`) so
 * middleware can read it on every route. `accessToken` is also Path=/ to
 * let server components read it.
 */

import type { NextResponse } from "next/server";
import {
  STAFF_REFRESH_TTL_SECONDS,
} from "@/lib/auth/jwt";

export const ACCESS_COOKIE = "accessToken";
export const REFRESH_COOKIE = "refreshToken";

// Access cookie matches access-token TTL (15 minutes = 900 seconds). The
// cookie outliving the token by a few seconds is harmless — verify will
// reject it and the client will silently refresh.
const ACCESS_COOKIE_MAX_AGE = 15 * 60;

interface CookieAttrs {
  path: string;
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
}

function commonAttrs(maxAge: number): CookieAttrs {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, commonAttrs(ACCESS_COOKIE_MAX_AGE));
  response.cookies.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    commonAttrs(STAFF_REFRESH_TTL_SECONDS),
  );
}

export function clearAuthCookies(response: NextResponse) {
  // maxAge: 0 tells the browser to drop the cookie immediately.
  response.cookies.set(ACCESS_COOKIE, "", { ...commonAttrs(0) });
  response.cookies.set(REFRESH_COOKIE, "", { ...commonAttrs(0) });
}
