/**
 * Realm-parameterised guard core.
 *
 * `requireAuth(realm, request?)` reads the access token from either the
 * Authorization header (client fetch) or the realm's access cookie (SSR /
 * Server Actions), then asks the realm to verify + hydrate the actor.
 *
 * Throws `UnauthorizedError` on any failure path (missing / bad / expired
 * token, inactive actor). Domain access-policy lives elsewhere — this
 * helper only answers "is the caller authenticated?".
 */

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/api/error";
import type { AuthRealm } from "@/lib/auth/realm";

/** Extract bearer token from Authorization header. */
function bearerFromHeader(request: NextRequest): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const tok = auth.slice(7).trim();
    if (tok) return tok;
  }
  return null;
}

/** Read realm access token from a NextRequest (header preferred, then cookie). */
function readAccessTokenFromRequest<TActor>(
  realm: AuthRealm<TActor>,
  request: NextRequest,
): string | null {
  const fromHeader = bearerFromHeader(request);
  if (fromHeader) return fromHeader;
  const cookie = request.cookies.get(realm.accessCookie)?.value;
  return cookie ?? null;
}

/** Read realm access token from the framework cookie store (Server Component path). */
async function readAccessTokenFromCookieStore<TActor>(
  realm: AuthRealm<TActor>,
): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(realm.accessCookie)?.value ?? null;
  } catch {
    // `cookies()` throws outside a request scope (background scripts).
    return null;
  }
}

/**
 * Verify the access token for the given realm and load fresh actor fields.
 * Throws `UnauthorizedError` on any failure (missing token, bad signature,
 * expired, account deactivated).
 *
 * Call with the `NextRequest` from API routes; omit in Server Components
 * and the cookie store will be read instead.
 */
export async function requireAuth<TActor>(
  realm: AuthRealm<TActor>,
  request?: NextRequest,
): Promise<TActor> {
  let token: string | null = null;
  if (request) token = readAccessTokenFromRequest(realm, request);
  if (!token) token = await readAccessTokenFromCookieStore(realm);
  if (!token) {
    throw new UnauthorizedError(
      realm.audience === "customer"
        ? "Missing customer access token"
        : "Missing access token",
    );
  }
  const actor = await realm.hydrateFromAccessToken(token);
  if (!actor) {
    throw new UnauthorizedError(
      realm.audience === "customer"
        ? "Invalid or expired customer access token"
        : "Invalid or expired access token",
    );
  }
  return actor;
}
