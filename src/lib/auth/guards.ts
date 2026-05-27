/**
 * Server-side auth guards for App Router handlers + RSC.
 *
 * Two flavours of token source:
 *   - Authorization: Bearer <jwt>  — used by client `fetch()` calls
 *   - accessToken cookie           — used by SSR / Server Actions
 * `getAccessTokenFromRequest` handles both.
 */

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import {
  verifyAccessToken,
  type StaffJwtPayload,
} from "@/lib/auth/jwt";
import { UnauthorizedError, ForbiddenError } from "@/lib/api/error";
import { STAFF_ROLES, type StaffRole } from "@/lib/auth/roles";

export const ACCESS_COOKIE_NAME = "accessToken";
export const REFRESH_COOKIE_NAME = "refreshToken";

/** Augmented payload returned by `requireAuth` — includes fresh DB fields. */
export interface AuthenticatedStaff extends StaffJwtPayload {
  userId: string;        // alias of sub for callsite ergonomics
  email: string | null;
  phone: string | null;
  preferredRegion: string | null;
  mustChangePassword: boolean;
}

function getAccessTokenFromRequest(request?: NextRequest): string | null {
  if (request) {
    const auth = request.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const tok = auth.slice(7).trim();
      if (tok) return tok;
    }
    const cookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
    if (cookie) return cookie;
  }
  return null;
}

async function getAccessTokenFromCookieStore(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(ACCESS_COOKIE_NAME)?.value ?? null;
  } catch {
    // `cookies()` throws outside a request scope (e.g. background scripts).
    return null;
  }
}

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
  let token = getAccessTokenFromRequest(request);
  if (!token) token = await getAccessTokenFromCookieStore();
  if (!token) throw new UnauthorizedError("Missing access token");

  let payload: StaffJwtPayload;
  try {
    payload = await verifyAccessToken(token, "staff");
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      phone: true,
      status: true,
      role: true,
      preferredRegion: true,
      mustChangePassword: true,
    },
  });
  if (user?.status !== "ACTIVE") {
    throw new UnauthorizedError("Account is inactive or missing");
  }

  return {
    ...payload,
    userId: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    preferredRegion: user.preferredRegion ?? null,
    mustChangePassword: user.mustChangePassword,
  };
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
