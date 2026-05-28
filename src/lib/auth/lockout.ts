/**
 * Staff lockout — thin facade over `core/lockout` bound to `staffRealm`.
 *
 * Preserves the historical surface (`isLockedOut`, `lockoutRemainingMs`,
 * `recordLoginAttempt`, `LOCKOUT_*` constants) so route handlers and the
 * existing `lockout.test.ts` keep working.
 *
 * The sliding-window storage mechanics live in `realms/staff-realm.ts`:
 * 5 failures within 15 minutes → 15-minute lockout, counted via
 * `LoginAttempt` rows; `User.failedLoginCount` mirrors the window count.
 */

import { staffRealm } from "@/lib/auth/realms/staff-realm";
import {
  isLockedOut as coreIsLockedOut,
  lockoutRemainingMs as coreLockoutRemainingMs,
  recordLoginAttempt as coreRecordLoginAttempt,
} from "@/lib/auth/core/lockout";

export {
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MS,
  LOCKOUT_DURATION_MS,
} from "@/lib/auth/core/lockout";

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
  return coreIsLockedOut(user, now);
}

/** Milliseconds until lockout expires; 0 if not locked. */
export function lockoutRemainingMs(
  user: Pick<AttemptedUser, "lockedUntil"> | null | undefined,
  now: Date = new Date(),
): number {
  return coreLockoutRemainingMs(user, now);
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
 * Mirrors the historical semantics:
 *  - On success: writes attempt row + resets counter + clears lockout +
 *    updates lastLoginAt.
 *  - On failure: writes attempt row + counts failures in the sliding window
 *    + sets lockout if threshold reached.
 */
export async function recordLoginAttempt(opts: RecordOpts): Promise<void> {
  await coreRecordLoginAttempt(staffRealm, {
    identifier: opts.username,
    actorId: opts.userId ?? null,
    success: opts.success,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
  });
}
