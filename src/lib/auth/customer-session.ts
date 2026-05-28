/**
 * Customer session — thin facade over `core/session` bound to `customerRealm`.
 *
 * Preserves the historical surface (`createCustomerSession`,
 * `findValidCustomerSession`, `rotateCustomerSession`, `revokeCustomerSession`,
 * `revokeAllCustomerSessions`) so route handlers don't need to learn the
 * realm seam.
 */

import { customerRealm } from "@/lib/auth/realms/customer-realm";
import {
  createSession as coreCreateSession,
  findValidSession as coreFindValidSession,
  rotateSession as coreRotateSession,
  revokeSession as coreRevokeSession,
  revokeAllSessionsForActor,
  type SessionCreateResult,
} from "@/lib/auth/core/session";

export interface CustomerSessionCreateInput {
  contactId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface CustomerSessionCreateResult extends SessionCreateResult {}

export async function createCustomerSession(
  input: CustomerSessionCreateInput,
): Promise<CustomerSessionCreateResult> {
  return coreCreateSession(customerRealm, {
    actorId: input.contactId,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
  });
}

export async function findValidCustomerSession(refreshToken: string) {
  const row = await coreFindValidSession(customerRealm, refreshToken);
  if (!row) return null;
  // Shape preservation: callers expect `contactId` not `actorId`.
  return {
    id: row.id,
    contactId: row.actorId,
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
  };
}

export async function rotateCustomerSession(
  oldRefreshToken: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<CustomerSessionCreateResult | null> {
  return coreRotateSession(customerRealm, oldRefreshToken, context);
}

export async function revokeCustomerSession(refreshToken: string): Promise<boolean> {
  return coreRevokeSession(customerRealm, refreshToken);
}

export async function revokeAllCustomerSessions(contactId: string): Promise<number> {
  return revokeAllSessionsForActor(customerRealm, contactId);
}
