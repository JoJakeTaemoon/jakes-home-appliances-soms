/**
 * Staff guards — thin facade over `core/guards` bound to `staffRealm`.
 *
 * The actual mechanics (token extraction, JWT verify, actor hydration)
 * live in `@/lib/auth/core/guards`; this file preserves the historical
 * import path + adds the role-check helper used across routes.
 */

import type { NextRequest } from "next/server";
import { ForbiddenError } from "@/lib/api/error";
import { STAFF_ROLES, type StaffRole } from "@/lib/auth/roles";
import { requireAuth as coreRequireAuth } from "@/lib/auth/core/guards";
import {
  staffRealm,
  type AuthenticatedStaff,
} from "@/lib/auth/realms/staff-realm";

// Preserve historical re-exports — many callers import the cookie names
// + the AuthenticatedStaff type from here.
export {
  STAFF_ACCESS_COOKIE as ACCESS_COOKIE_NAME,
  STAFF_REFRESH_COOKIE as REFRESH_COOKIE_NAME,
} from "@/lib/auth/realms/staff-realm";
export type { AuthenticatedStaff };

/**
 * Verify the access token and load fresh User fields. Throws
 * `UnauthorizedError` on any failure (missing token, bad signature,
 * expired, account deactivated).
 *
 * Call with the `NextRequest` from API routes; omit in Server Components
 * and the cookie store will be read instead.
 */
export async function requireAuth(
  request?: NextRequest,
): Promise<AuthenticatedStaff> {
  return coreRequireAuth(staffRealm, request);
}

/**
 * Require the caller to be one of the given roles. Pass a single role or
 * an array. Throws ForbiddenError on mismatch.
 *
 *   await requireRole(req, "ADMIN");
 *   await requireRole(req, ["ADMIN", "MANAGER"]);
 */
export async function requireRole(
  request: NextRequest | undefined,
  roles: StaffRole | readonly StaffRole[],
): Promise<AuthenticatedStaff> {
  const caller = await requireAuth(request);
  const allowed = Array.isArray(roles) ? roles : [roles as StaffRole];
  if (!(allowed as readonly string[]).includes(caller.role)) {
    throw new ForbiddenError("Insufficient role");
  }
  return caller;
}

/** Type-guard used by tests and callers that received `string` payloads. */
export function isStaffRoleString(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}
