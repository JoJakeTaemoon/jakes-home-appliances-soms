/**
 * Portal-account lockout policy.
 *
 * Same numerics as the staff lockout (5 fails / 15 min → 15-min lockout) but
 * the counters live on `CustomerContact` instead of `User`. There is no
 * `LoginAttempt`-equivalent table for customer accounts yet — failed-login
 * forensics are recorded via AuditLog only (action=PORTAL_LOGIN_FAILED).
 */

import prisma from "@/lib/prisma";

export const CUSTOMER_LOCKOUT_THRESHOLD = 5;
export const CUSTOMER_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const CUSTOMER_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface AttemptedContact {
  id: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isContactLockedOut(
  contact: Pick<AttemptedContact, "lockedUntil"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!contact || !contact.lockedUntil) return false;
  return contact.lockedUntil.getTime() > now.getTime();
}

/**
 * Increment failure counter; lock account if threshold reached.
 *
 * Unlike the staff lockout (which counts attempts in a sliding window via
 * `LoginAttempt`), this version uses the simple counter stored on the
 * CustomerContact row. Counter is reset on successful login or successful
 * password change.
 */
export async function recordCustomerFailedLogin(contactId: string): Promise<void> {
  const c = await prisma.customerContact.findUnique({
    where: { id: contactId },
    select: { failedLoginCount: true },
  });
  if (!c) return;
  const nextCount = c.failedLoginCount + 1;
  const updates: { failedLoginCount: number; lockedUntil?: Date } = {
    failedLoginCount: nextCount,
  };
  if (nextCount >= CUSTOMER_LOCKOUT_THRESHOLD) {
    updates.lockedUntil = new Date(Date.now() + CUSTOMER_LOCKOUT_DURATION_MS);
  }
  await prisma.customerContact.update({
    where: { id: contactId },
    data: updates,
  });
}

export async function recordCustomerLoginSuccess(contactId: string): Promise<void> {
  await prisma.customerContact.update({
    where: { id: contactId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}
