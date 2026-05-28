/**
 * Customer cookies — thin facade over the realm's cookie helpers.
 *
 * Preserves `CUSTOMER_ACCESS_COOKIE` / `CUSTOMER_REFRESH_COOKIE` exports +
 * `setCustomerAuthCookies` / `clearCustomerAuthCookies` historical names.
 * Distinct cookie NAMES from staff so a single browser can hold both a
 * staff session AND a customer session simultaneously during dev. The
 * actual cookie attributes live in `core/cookies`.
 *
 * Customer refresh TTL is 30 days (vs 7 for staff) per CLAUDE.md §Customer
 * portal — longer because customers log in less frequently and have no
 * device-policy override.
 */

import type { NextResponse } from "next/server";
import { customerRealm } from "@/lib/auth/realms/customer-realm";

export {
  CUSTOMER_ACCESS_COOKIE,
  CUSTOMER_REFRESH_COOKIE,
} from "@/lib/auth/realms/customer-realm";

export function setCustomerAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  customerRealm.setCookies(response, tokens);
}

export function clearCustomerAuthCookies(response: NextResponse) {
  customerRealm.clearCookies(response);
}
