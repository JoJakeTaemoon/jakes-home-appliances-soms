/**
 * Realm-parameterised lockout core.
 *
 * Pure functions for "is this account locked?" + a single recordAttempt
 * helper that defers to the realm for storage. Threshold + window numerics
 * live in `@/lib/auth/realm` so both realms share the same policy.
 *
 * The realm decides HOW failures are counted (staff = sliding window via
 * LoginAttempt rows; customer = naive counter on the CustomerContact row).
 * The core decides WHEN to surface "locked" vs "invalid credentials".
 */

import type {
  AttemptContext,
  AuthRealm,
  LockoutCounters,
} from "@/lib/auth/realm";

export {
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MS,
  LOCKOUT_DURATION_MS,
} from "@/lib/auth/realm";

/** True iff `lockedUntil` is in the future. */
export function isLockedOut(
  counters: Pick<LockoutCounters, "lockedUntil"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!counters || !counters.lockedUntil) return false;
  return counters.lockedUntil.getTime() > now.getTime();
}

/** Milliseconds until lockout expires; 0 if not locked. */
export function lockoutRemainingMs(
  counters: Pick<LockoutCounters, "lockedUntil"> | null | undefined,
  now: Date = new Date(),
): number {
  if (!counters || !counters.lockedUntil) return 0;
  const diff = counters.lockedUntil.getTime() - now.getTime();
  return diff > 0 ? diff : 0;
}

/**
 * Record a single login attempt against the realm. Success path resets
 * counters + stamps lastLoginAt; failure path increments + may lock.
 *
 * Returns the post-update counters from the realm so the caller can choose
 * to surface ACCOUNT_LOCKED on the threshold-tripping attempt.
 */
export async function recordLoginAttempt<TActor>(
  realm: AuthRealm<TActor>,
  ctx: AttemptContext & { success: boolean },
): Promise<LockoutCounters | null> {
  const { success, ...rest } = ctx;
  if (success) {
    if (rest.actorId) {
      await realm.lockout.recordSuccess(rest);
    }
    return null;
  }
  return realm.lockout.recordFailure(rest);
}
