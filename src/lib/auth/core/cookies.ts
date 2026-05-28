/**
 * Realm-parameterised cookie core.
 *
 * Both realms use the same cookie attributes (Path=/, httpOnly, sameSite=lax,
 * secure-in-prod). They differ in cookie name + TTL only. Each realm exposes
 * `setCookies(response, tokens)` + `clearCookies(response)` so callers can
 * stay realm-agnostic.
 */

import type { NextResponse } from "next/server";

/** Access cookie max-age matches the staff/customer access-token TTL (15min). */
export const ACCESS_COOKIE_MAX_AGE = 15 * 60;

export interface CookieAttrs {
  path: string;
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
}

export function commonCookieAttrs(maxAge: number): CookieAttrs {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

/** Realm-agnostic helper used by each realm's setCookies. */
export function writeAuthCookies(
  response: NextResponse,
  args: {
    accessCookie: string;
    refreshCookie: string;
    accessToken: string;
    refreshToken: string;
    accessMaxAge: number;
    refreshMaxAge: number;
  },
) {
  response.cookies.set(
    args.accessCookie,
    args.accessToken,
    commonCookieAttrs(args.accessMaxAge),
  );
  response.cookies.set(
    args.refreshCookie,
    args.refreshToken,
    commonCookieAttrs(args.refreshMaxAge),
  );
}

/** Realm-agnostic helper used by each realm's clearCookies. */
export function eraseAuthCookies(
  response: NextResponse,
  args: { accessCookie: string; refreshCookie: string },
) {
  response.cookies.set(args.accessCookie, "", commonCookieAttrs(0));
  response.cookies.set(args.refreshCookie, "", commonCookieAttrs(0));
}
