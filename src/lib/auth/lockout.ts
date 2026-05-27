/**
 * Login lockout policy (F.6 / UC-AU-01).
 *
 * Threshold: 5 failed login attempts within 15 minutes → 15-minute lockout.
 * Counters are stored on `User` (failedLoginCount, lockedUntil); each attempt
 * (success or failure) writes a row to `LoginAttempt` for forensics.
 *
 * Same shape is mirrored on `CustomerContact` for portal accounts — that
 * helper lives in `src/lib/auth/customer-lockout.ts` if/when the portal
 * lands (Phase 3.5). Keeping them separate avoids cross-contaminating
 * staff lockout state with customer lockouts.
 */

import prisma from "@/lib/prisma";

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface AttemptedUser {
  id: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/** True iff the user's lockedUntil is in the future. */
export function isLockedOut(
  user: Pick<AttemptedUser, "lockedUntil"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!user || !user.lockedUntil) return false;
  return user.lockedUntil.getTime() > now.getTime();
}

/** Milliseconds until lockout expires; 0 if not locked. */
export function lockoutRemainingMs(
  user: Pick<AttemptedUser, "lockedUntil"> | null | undefined,
  now: Date = new Date(),
): number {
  if (!user || !user.lockedUntil) return 0;
  const diff = user.lockedUntil.getTime() - now.getTime();
  return diff > 0 ? diff : 0;
}

interface RecordOpts {
  username: string;
  success: boolean;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Record one login attempt and update the user's failure counter / lockout.
 *
 * On success: writes attempt row + resets counter + clears lockout +
 * updates lastLoginAt.
 *
 * On failure: writes attempt row + increments counter + sets lockout if
 * threshold reached. The threshold is evaluated against attempts inside the
 * sliding window (LOCKOUT_WINDOW_MS) so two stale fails from yesterday
 * plus three fresh fails today do NOT trigger a lockout.
 */
export async function recordLoginAttempt(opts: RecordOpts): Promise<void> {
  const { username, success, userId, ipAddress, userAgent } = opts;

  await prisma.loginAttempt.create({
    data: {
      username,
      userId: userId ?? null,
      success,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });

  if (!userId) return; // unknown username — nothing to update on User

  if (success) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
    return;
  }

  // Failure: count recent fails (within window) for THIS user.
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const recentFails = await prisma.loginAttempt.count({
    where: {
      userId,
      success: false,
      attemptedAt: { gte: windowStart },
    },
  });

  const updates: { failedLoginCount: number; lockedUntil?: Date } = {
    failedLoginCount: recentFails,
  };
  if (recentFails >= LOCKOUT_THRESHOLD) {
    updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
  }

  await prisma.user.update({
    where: { id: userId },
    data: updates,
  });
}
