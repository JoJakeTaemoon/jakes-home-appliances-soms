/**
 * Staff cookies — thin facade over the realm's cookie helpers.
 *
 * Preserves `ACCESS_COOKIE` / `REFRESH_COOKIE` exports + `setAuthCookies` /
 * `clearAuthCookies` historical names. The actual cookie attributes
 * (Path=/, httpOnly, sameSite=lax, secure-in-prod) live in `core/cookies`.
 */

import type { NextResponse } from "next/server";
import { staffRealm } from "@/lib/auth/realms/staff-realm";

export {
  STAFF_ACCESS_COOKIE as ACCESS_COOKIE,
  STAFF_REFRESH_COOKIE as REFRESH_COOKIE,
} from "@/lib/auth/realms/staff-realm";

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  staffRealm.setCookies(response, tokens);
}

export function clearAuthCookies(response: NextResponse) {
  staffRealm.clearCookies(response);
}
