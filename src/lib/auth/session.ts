/**
 * Staff session management.
 *
 * Each refresh token in the wild corresponds to exactly one `Session` row.
 * Rotation issues a brand-new row and revokes the old one in a single
 * transaction so a stolen refresh token can be used at most once.
 *
 * Refresh token values are signed JWTs (see `signStaffRefreshToken`) — the
 * persisted `refreshToken` column is the exact same string. We store the
 * raw token rather than a hash so revocation and lookup are a single
 * indexed query; the JWT signature already prevents forgery.
 */

import prisma from "@/lib/prisma";
import {
  STAFF_REFRESH_TTL_SECONDS,
  signStaffRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth/jwt";

export interface SessionCreateInput {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface SessionCreateResult {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Create a fresh session row and mint the matching refresh token. The
 * caller is responsible for setting the cookie + returning the response.
 */
export async function createSession(
  input: SessionCreateInput,
): Promise<SessionCreateResult> {
  const expiresAt = new Date(Date.now() + STAFF_REFRESH_TTL_SECONDS * 1000);

  // Two-step: insert with a placeholder token, then update the row with the
  // signed JWT (which embeds the row id). Avoids cuid pre-generation and
  // keeps the DB authoritative for the session id.
  const placeholder = `pending-${crypto.randomUUID()}`;
  const created = await prisma.session.create({
    data: {
      userId: input.userId,
      refreshToken: placeholder,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  const refreshToken = await signStaffRefreshToken({
    userId: input.userId,
    sessionId: created.id,
  });

  await prisma.session.update({
    where: { id: created.id },
    data: { refreshToken },
  });

  return { sessionId: created.id, refreshToken, expiresAt };
}

/**
 * Find a non-expired, non-revoked session by refresh-token value. Returns
 * null if the token is unknown, revoked, or past expiry.
 */
export async function findValidSession(refreshToken: string) {
  const row = await prisma.session.findUnique({
    where: { refreshToken },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/**
 * Rotate a refresh token: verify, revoke old, mint new. Returns null if the
 * input token is invalid, revoked, expired, or fails JWT verification.
 *
 * The caller passes userAgent/ipAddress for the NEW session row so audit
 * trails reflect the device that performed the rotation.
 */
export async function rotateSession(
  oldRefreshToken: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<SessionCreateResult | null> {
  // Verify the JWT first — cheap and catches forged cookies before we hit
  // the DB.
  let claims;
  try {
    claims = await verifyRefreshToken(oldRefreshToken, "staff");
  } catch {
    return null;
  }

  const existing = await findValidSession(oldRefreshToken);
  if (!existing) return null;
  if (existing.userId !== claims.sub) return null;

  const expiresAt = new Date(Date.now() + STAFF_REFRESH_TTL_SECONDS * 1000);
  const placeholder = `pending-${crypto.randomUUID()}`;

  // Same two-step pattern as createSession. We use $transaction so the
  // old row is revoked atomically with the new row being created — there's
  // no instant where neither is valid.
  const newRow = await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return tx.session.create({
      data: {
        userId: existing.userId,
        refreshToken: placeholder,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt,
      },
      select: { id: true, userId: true },
    });
  });

  const refreshToken = await signStaffRefreshToken({
    userId: newRow.userId,
    sessionId: newRow.id,
  });
  await prisma.session.update({
    where: { id: newRow.id },
    data: { refreshToken },
  });

  return { sessionId: newRow.id, refreshToken, expiresAt };
}

/**
 * Mark a session revoked. Idempotent — calling twice is a no-op for the
 * second call. Returns true iff a row was actually updated.
 */
export async function revokeSession(refreshToken: string): Promise<boolean> {
  const existing = await prisma.session.findUnique({
    where: { refreshToken },
    select: { id: true, revokedAt: true },
  });
  if (!existing || existing.revokedAt) return false;
  await prisma.session.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return true;
}

/**
 * Revoke every active session for a user. Used when an admin disables an
 * account or when we detect refresh-token reuse.
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
