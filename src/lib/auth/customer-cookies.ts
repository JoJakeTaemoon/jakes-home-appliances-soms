/**
 * Cookie configuration for customer portal auth tokens.
 *
 * Distinct cookie NAMES from staff (`accessToken` / `refreshToken`) so a
 * single browser can hold both a staff session AND a customer session
 * simultaneously during dev. Both share Path=/ so middleware can read them
 * across the full app.
 *
 * Customer refresh TTL is 30 days (vs 7 for staff) per CLAUDE.md §Customer
 * portal — longer because customers log in less frequently and have no
 * device-policy override.
 */

import type { NextResponse } from "next/server";
import { CUSTOMER_REFRESH_TTL_SECONDS } from "@/lib/auth/jwt";

export const CUSTOMER_ACCESS_COOKIE = "customerAccessToken";
export const CUSTOMER_REFRESH_COOKIE = "customerRefreshToken";

const ACCESS_COOKIE_MAX_AGE = 15 * 60; // 15 min — matches token TTL

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

export function setCustomerAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  response.cookies.set(
    CUSTOMER_ACCESS_COOKIE,
    tokens.accessToken,
    commonAttrs(ACCESS_COOKIE_MAX_AGE),
  );
  response.cookies.set(
    CUSTOMER_REFRESH_COOKIE,
    tokens.refreshToken,
    commonAttrs(CUSTOMER_REFRESH_TTL_SECONDS),
  );
}

export function clearCustomerAuthCookies(response: NextResponse) {
  response.cookies.set(CUSTOMER_ACCESS_COOKIE, "", { ...commonAttrs(0) });
  response.cookies.set(CUSTOMER_REFRESH_COOKIE, "", { ...commonAttrs(0) });
}
