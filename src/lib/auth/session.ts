/**
 * Staff session — thin facade over `core/session` bound to `staffRealm`.
 *
 * Preserves the historical surface (`createSession`, `findValidSession`,
 * `rotateSession`, `revokeSession`, `revokeAllUserSessions`) so route
 * handlers and tests don't need to learn the realm seam.
 */

import { staffRealm } from "@/lib/auth/realms/staff-realm";
import {
  createSession as coreCreateSession,
  findValidSession as coreFindValidSession,
  rotateSession as coreRotateSession,
  revokeSession as coreRevokeSession,
  revokeAllSessionsForActor,
  type SessionCreateResult,
} from "@/lib/auth/core/session";

export interface SessionCreateInput {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export type { SessionCreateResult };

export async function createSession(
  input: SessionCreateInput,
): Promise<SessionCreateResult> {
  return coreCreateSession(staffRealm, {
    actorId: input.userId,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
  });
}

export async function findValidSession(refreshToken: string) {
  const row = await coreFindValidSession(staffRealm, refreshToken);
  if (!row) return null;
  // Shape preservation: callers expect `userId` not `actorId`.
  return {
    id: row.id,
    userId: row.actorId,
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
  };
}

export async function rotateSession(
  oldRefreshToken: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<SessionCreateResult | null> {
  return coreRotateSession(staffRealm, oldRefreshToken, context);
}

export async function revokeSession(refreshToken: string): Promise<boolean> {
  return coreRevokeSession(staffRealm, refreshToken);
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  return revokeAllSessionsForActor(staffRealm, userId);
}
