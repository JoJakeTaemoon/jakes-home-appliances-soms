/**
 * Realm-parameterised session core.
 *
 * Each realm exposes a SessionAdapter (`AuthRealm.session`) wrapping its
 * own Prisma model (Session vs CustomerSession). The core implements the
 * generic rotate / revoke / findValid / revokeAll logic so a single fix
 * to the two-step refresh-token mint (placeholder → signed JWT → update)
 * applies to both audiences.
 *
 * Refresh tokens are signed JWTs whose `sid` claim is the persisted row
 * id. The DB row is the source of truth for revocation — we always look
 * it up before honouring a refresh.
 */

import type { AuthRealm } from "@/lib/auth/realm";
import { verifyRefreshToken } from "@/lib/auth/jwt";

export interface SessionCreateResult {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Create a fresh session row and mint the matching refresh token. The
 * two-step pattern (placeholder insert → update with signed JWT) keeps
 * cuid generation DB-side while still embedding the row id in the JWT.
 */
export async function createSession<TActor>(
  realm: AuthRealm<TActor>,
  args: {
    actorId: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  },
): Promise<SessionCreateResult> {
  const expiresAt = new Date(Date.now() + realm.refreshTtlSec * 1000);
  const placeholder = `pending-${crypto.randomUUID()}`;
  const created = await realm.session.create({
    actorId: args.actorId,
    refreshToken: placeholder,
    userAgent: args.userAgent ?? null,
    ipAddress: args.ipAddress ?? null,
    expiresAt,
  });
  const refreshToken = await realm.signRefreshToken({
    actorId: args.actorId,
    sessionId: created.id,
  });
  await realm.session.updateRefreshToken(created.id, refreshToken);
  return { sessionId: created.id, refreshToken, expiresAt };
}

/** Find a non-expired, non-revoked session by refresh token. */
export async function findValidSession<TActor>(
  realm: AuthRealm<TActor>,
  refreshToken: string,
) {
  return realm.session.findValid(refreshToken);
}

/**
 * Rotate a refresh token: verify JWT, atomically revoke old session + mint
 * new session (delegated to `realm.session.rotate` so the realm can wrap
 * both writes in a single $transaction). Returns null on any failure path.
 */
export async function rotateSession<TActor>(
  realm: AuthRealm<TActor>,
  oldRefreshToken: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<SessionCreateResult | null> {
  // Verify the JWT first — cheap and catches forged cookies before the DB.
  let claims;
  try {
    claims = await verifyRefreshToken(oldRefreshToken, realm.audience);
  } catch {
    return null;
  }

  const existing = await realm.session.findValid(oldRefreshToken);
  if (!existing) return null;
  if (existing.actorId !== claims.sub) return null;

  const expiresAt = new Date(Date.now() + realm.refreshTtlSec * 1000);
  const placeholder = `pending-${crypto.randomUUID()}`;

  const newRow = await realm.session.rotate({
    oldSessionId: existing.id,
    actorId: existing.actorId,
    placeholder,
    userAgent: context.userAgent ?? null,
    ipAddress: context.ipAddress ?? null,
    expiresAt,
  });

  const refreshToken = await realm.signRefreshToken({
    actorId: newRow.actorId,
    sessionId: newRow.id,
  });
  await realm.session.updateRefreshToken(newRow.id, refreshToken);

  return { sessionId: newRow.id, refreshToken, expiresAt };
}

/** Revoke a single session by refresh token. Idempotent. */
export async function revokeSession<TActor>(
  realm: AuthRealm<TActor>,
  refreshToken: string,
): Promise<boolean> {
  return realm.session.revoke(refreshToken);
}

/** Revoke every active session for an actor. Returns affected count. */
export async function revokeAllSessionsForActor<TActor>(
  realm: AuthRealm<TActor>,
  actorId: string,
): Promise<number> {
  return realm.session.revokeAllForActor(actorId);
}
