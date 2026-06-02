/**
 * Field-realm guards — mirror of `./guards.ts` bound to `fieldRealm`.
 *
 * Mobile API routes (`/api/mobile/*`) and any other handler that serves
 * TECHNICIAN traffic should authenticate through this helper so that the
 * `fieldAccessToken` cookie (not the office `officeAccessToken`) is read.
 */

import type { NextRequest } from "next/server";
import { requireAuth as coreRequireAuth } from "@/lib/auth/core/guards";
import {
  fieldRealm,
  type AuthenticatedField,
} from "@/lib/auth/realms/field-realm";

export {
  FIELD_ACCESS_COOKIE,
  FIELD_REFRESH_COOKIE,
} from "@/lib/auth/realms/field-realm";
export type { AuthenticatedField };

/**
 * Verify the field access token and load fresh User fields. Throws
 * `UnauthorizedError` on any failure (missing token, bad signature,
 * expired, account deactivated, role no longer TECHNICIAN).
 */
export async function requireFieldAuth(
  request?: NextRequest,
): Promise<AuthenticatedField> {
  return coreRequireAuth(fieldRealm, request);
}
