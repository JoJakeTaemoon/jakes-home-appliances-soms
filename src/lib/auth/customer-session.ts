/**
 * Customer (portal) session management.
 *
 * Mirror of staff `session.ts` but backed by `CustomerSession` rows and using
 * the customer audience refresh secret. Each refresh token corresponds to
 * exactly one CustomerSession row; rotation atomically revokes the old row
 * and creates a new one.
 *
 * TTL: 30 days (vs 7 for staff) per CLAUDE.md / SPEC §11.
 */

import prisma from "@/lib/prisma";
import {
  CUSTOMER_REFRESH_TTL_SECONDS,
  signCustomerRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth/jwt";

export interface CustomerSessionCreateInput {
  contactId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface CustomerSessionCreateResult {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function createCustomerSession(
  input: CustomerSessionCreateInput,
): Promise<CustomerSessionCreateResult> {
  const expiresAt = new Date(Date.now() + CUSTOMER_REFRESH_TTL_SECONDS * 1000);

  const placeholder = `pending-${crypto.randomUUID()}`;
  const created = await prisma.customerSession.create({
    data: {
      contactId: input.contactId,
      refreshToken: placeholder,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  const refreshToken = await signCustomerRefreshToken({
    contactId: input.contactId,
    sessionId: created.id,
  });

  await prisma.customerSession.update({
    where: { id: created.id },
    data: { refreshToken },
  });

  return { sessionId: created.id, refreshToken, expiresAt };
}

export async function findValidCustomerSession(refreshToken: string) {
  const row = await prisma.customerSession.findUnique({
    where: { refreshToken },
    select: {
      id: true,
      contactId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export async function rotateCustomerSession(
  oldRefreshToken: string,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<CustomerSessionCreateResult | null> {
  let claims;
  try {
    claims = await verifyRefreshToken(oldRefreshToken, "customer");
  } catch {
    return null;
  }

  const existing = await findValidCustomerSession(oldRefreshToken);
  if (!existing) return null;
  if (existing.contactId !== claims.sub) return null;

  const expiresAt = new Date(Date.now() + CUSTOMER_REFRESH_TTL_SECONDS * 1000);
  const placeholder = `pending-${crypto.randomUUID()}`;

  const newRow = await prisma.$transaction(async (tx) => {
    await tx.customerSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return tx.customerSession.create({
      data: {
        contactId: existing.contactId,
        refreshToken: placeholder,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt,
      },
      select: { id: true, contactId: true },
    });
  });

  const refreshToken = await signCustomerRefreshToken({
    contactId: newRow.contactId,
    sessionId: newRow.id,
  });
  await prisma.customerSession.update({
    where: { id: newRow.id },
    data: { refreshToken },
  });

  return { sessionId: newRow.id, refreshToken, expiresAt };
}

export async function revokeCustomerSession(refreshToken: string): Promise<boolean> {
  const existing = await prisma.customerSession.findUnique({
    where: { refreshToken },
    select: { id: true, revokedAt: true },
  });
  if (!existing || existing.revokedAt) return false;
  await prisma.customerSession.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return true;
}

export async function revokeAllCustomerSessions(contactId: string): Promise<number> {
  const result = await prisma.customerSession.updateMany({
    where: { contactId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
