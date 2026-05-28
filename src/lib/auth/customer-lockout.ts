/**
 * Customer lockout — thin facade over `core/lockout` bound to `customerRealm`.
 *
 * Preserves the historical surface (`isContactLockedOut`,
 * `recordCustomerFailedLogin`, `recordCustomerLoginSuccess`, `CUSTOMER_LOCKOUT_*`
 * constants). The counter mechanics live in `realms/customer-realm.ts`:
 * naive increment on `CustomerContact.failedLoginCount` (5 fails → 15-min
 * lockout). Failed-login forensics for portal accounts go to AuditLog at
 * the route level — there is no `CustomerLoginAttempt` table.
 */

import { customerRealm } from "@/lib/auth/realms/customer-realm";
import { isLockedOut as coreIsLockedOut } from "@/lib/auth/core/lockout";

// Customer-side constant aliases (historical names — same numerics as staff).
export {
  LOCKOUT_THRESHOLD as CUSTOMER_LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MS as CUSTOMER_LOCKOUT_WINDOW_MS,
  LOCKOUT_DURATION_MS as CUSTOMER_LOCKOUT_DURATION_MS,
} from "@/lib/auth/core/lockout";

export interface AttemptedContact {
  id: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isContactLockedOut(
  contact: Pick<AttemptedContact, "lockedUntil"> | null | undefined,
  now: Date = new Date(),
): boolean {
  return coreIsLockedOut(contact, now);
}

/**
 * Increment failure counter; lock account if threshold reached. Naive
 * counter (no sliding window) — counter resets on success or password
 * change. Forensics for portal logins go to AuditLog at the route level.
 */
export async function recordCustomerFailedLogin(contactId: string): Promise<void> {
  await customerRealm.lockout.recordFailure({
    identifier: contactId,
    actorId: contactId,
  });
}

export async function recordCustomerLoginSuccess(contactId: string): Promise<void> {
  await customerRealm.lockout.recordSuccess({
    identifier: contactId,
    actorId: contactId,
  });
}
