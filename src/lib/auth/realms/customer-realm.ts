/**
 * Customer realm — concrete `AuthRealm` for portal accounts
 * (`CustomerContact` model). Mirrors `staff-realm.ts` but with customer
 * cookies, audience, TTLs, and naive-counter lockout.
 *
 * Cookies: `customerAccessToken` / `customerRefreshToken` (Path=/).
 * JWT aud: `customer`.
 * Refresh TTL: 30 days.
 * Lockout: simple increment on `CustomerContact.failedLoginCount` (5 fails
 * → 15min lock). No `CustomerLoginAttempt` table — failed-login forensics
 * go to AuditLog at the route level.
 */

import type { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  signCustomerAccessToken,
  signCustomerRefreshToken,
  verifyAccessToken,
  CUSTOMER_REFRESH_TTL_SECONDS,
  type CustomerJwtPayload,
} from "@/lib/auth/jwt";
import {
  ACCESS_COOKIE_MAX_AGE,
  writeAuthCookies,
  eraseAuthCookies,
} from "@/lib/auth/core/cookies";
import { LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MS } from "@/lib/auth/realm";
import type {
  AuthRealm,
  AuthRealmLockout,
  AuthRealmSession,
  AttemptContext,
  LockoutCounters,
  SessionRecord,
} from "@/lib/auth/realm";
import type { ContactRole, ContactScope, Locale } from "@/generated/prisma/client";

export const CUSTOMER_ACCESS_COOKIE = "customerAccessToken";
export const CUSTOMER_REFRESH_COOKIE = "customerRefreshToken";

/** Hydrated customer actor returned by `requireAuth(customerRealm, …)`. */
export interface AuthenticatedCustomer extends CustomerJwtPayload {
  contactId: string; // alias of sub
  customerId: string;
  customerCode: string;
  customerName: string;
  customerType: "B2C" | "B2B";
  name: string;
  phone1: string;
  email: string | null;
  language: Locale;
  role: ContactRole; // CONTRACT_PARTY | OPS_CONTACT
  scope: ContactScope;
  siteId: string | null;
  mustChangePassword: boolean;
  portalEnabled: boolean;
  smsOptOut: boolean;
  emailOptOut: boolean;
}

// ── Lockout adapter — naive counter on CustomerContact ───────────────────

const customerLockout: AuthRealmLockout = {
  async loadCounters(actorId): Promise<LockoutCounters | null> {
    const row = await prisma.customerContact.findUnique({
      where: { id: actorId },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    return row ? { failedLoginCount: row.failedLoginCount, lockedUntil: row.lockedUntil } : null;
  },

  async recordSuccess(ctx: AttemptContext): Promise<void> {
    if (!ctx.actorId) return;
    await prisma.customerContact.update({
      where: { id: ctx.actorId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  },

  async recordFailure(ctx: AttemptContext): Promise<LockoutCounters | null> {
    if (!ctx.actorId) return null;
    const c = await prisma.customerContact.findUnique({
      where: { id: ctx.actorId },
      select: { failedLoginCount: true },
    });
    if (!c) return null;
    const nextCount = c.failedLoginCount + 1;
    const updates: { failedLoginCount: number; lockedUntil?: Date } = {
      failedLoginCount: nextCount,
    };
    if (nextCount >= LOCKOUT_THRESHOLD) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }
    await prisma.customerContact.update({
      where: { id: ctx.actorId },
      data: updates,
    });
    return {
      failedLoginCount: nextCount,
      lockedUntil: updates.lockedUntil ?? null,
    };
  },
};

// ── Session adapter — `CustomerSession` model ────────────────────────────

const customerSession: AuthRealmSession = {
  async create({ actorId, refreshToken, userAgent, ipAddress, expiresAt }) {
    return prisma.customerSession.create({
      data: {
        contactId: actorId,
        refreshToken,
        userAgent: userAgent ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt,
      },
      select: { id: true },
    });
  },

  async updateRefreshToken(sessionId, refreshToken) {
    await prisma.customerSession.update({
      where: { id: sessionId },
      data: { refreshToken },
    });
  },

  async findValid(refreshToken): Promise<SessionRecord | null> {
    const row = await prisma.customerSession.findUnique({
      where: { refreshToken },
      select: { id: true, contactId: true, revokedAt: true, expiresAt: true },
    });
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return {
      id: row.id,
      actorId: row.contactId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  },

  async revoke(refreshToken): Promise<boolean> {
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
  },

  async revokeAllForActor(actorId): Promise<number> {
    const result = await prisma.customerSession.updateMany({
      where: { contactId: actorId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },

  async rotate({ oldSessionId, actorId, placeholder, userAgent, ipAddress, expiresAt }) {
    return prisma.$transaction(async (tx) => {
      await tx.customerSession.update({
        where: { id: oldSessionId },
        data: { revokedAt: new Date() },
      });
      const row = await tx.customerSession.create({
        data: {
          contactId: actorId,
          refreshToken: placeholder,
          userAgent: userAgent ?? null,
          ipAddress: ipAddress ?? null,
          expiresAt,
        },
        select: { id: true, contactId: true },
      });
      return { id: row.id, actorId: row.contactId };
    });
  },
};

// ── Realm ────────────────────────────────────────────────────────────────

export const customerRealm: AuthRealm<AuthenticatedCustomer> = {
  audience: "customer",
  accessCookie: CUSTOMER_ACCESS_COOKIE,
  refreshCookie: CUSTOMER_REFRESH_COOKIE,
  accessTtlSec: ACCESS_COOKIE_MAX_AGE,
  refreshTtlSec: CUSTOMER_REFRESH_TTL_SECONDS,

  async signAccessToken(actor) {
    return signCustomerAccessToken({
      contactId: actor.contactId,
      customerId: actor.customerId,
      contactRole: actor.role,
    });
  },

  async signRefreshToken({ actorId, sessionId }) {
    return signCustomerRefreshToken({ contactId: actorId, sessionId });
  },

  async hydrateFromAccessToken(token) {
    let payload: CustomerJwtPayload;
    try {
      payload = await verifyAccessToken(token, "customer");
    } catch {
      return null;
    }
    const contact = await prisma.customerContact.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        customerId: true,
        role: true,
        scope: true,
        siteId: true,
        name: true,
        phone1: true,
        email: true,
        language: true,
        portalEnabled: true,
        mustChangePassword: true,
        smsOptOut: true,
        emailOptOut: true,
        customer: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
    });
    if (!contact || !contact.portalEnabled) return null;
    return {
      ...payload,
      contactId: contact.id,
      customerId: contact.customerId,
      customerCode: contact.customer.code,
      customerName: contact.customer.name,
      customerType: contact.customer.type,
      name: contact.name,
      phone1: contact.phone1,
      email: contact.email ?? null,
      language: contact.language,
      role: contact.role,
      scope: contact.scope,
      siteId: contact.siteId ?? null,
      mustChangePassword: contact.mustChangePassword,
      portalEnabled: contact.portalEnabled,
      smsOptOut: contact.smsOptOut,
      emailOptOut: contact.emailOptOut,
    };
  },

  async hydrateFromSessionId(sessionId) {
    const row = await prisma.customerSession.findUnique({
      where: { id: sessionId },
      select: {
        contact: {
          select: {
            id: true,
            customerId: true,
            name: true,
            phone1: true,
            email: true,
            language: true,
            role: true,
            scope: true,
            siteId: true,
            portalEnabled: true,
            mustChangePassword: true,
            smsOptOut: true,
            emailOptOut: true,
            customer: { select: { id: true, code: true, name: true, type: true } },
          },
        },
      },
    });
    if (!row || !row.contact.portalEnabled) return null;
    const c = row.contact;
    return {
      sub: c.id,
      customerId: c.customerId,
      contactRole: c.role,
      aud: "customer",
      contactId: c.id,
      customerCode: c.customer.code,
      customerName: c.customer.name,
      customerType: c.customer.type,
      name: c.name,
      phone1: c.phone1,
      email: c.email ?? null,
      language: c.language,
      role: c.role,
      scope: c.scope,
      siteId: c.siteId ?? null,
      mustChangePassword: c.mustChangePassword,
      portalEnabled: c.portalEnabled,
      smsOptOut: c.smsOptOut,
      emailOptOut: c.emailOptOut,
    };
  },

  lockout: customerLockout,
  session: customerSession,

  setCookies(response: NextResponse, tokens) {
    writeAuthCookies(response, {
      accessCookie: CUSTOMER_ACCESS_COOKIE,
      refreshCookie: CUSTOMER_REFRESH_COOKIE,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessMaxAge: ACCESS_COOKIE_MAX_AGE,
      refreshMaxAge: CUSTOMER_REFRESH_TTL_SECONDS,
    });
  },

  clearCookies(response: NextResponse) {
    eraseAuthCookies(response, {
      accessCookie: CUSTOMER_ACCESS_COOKIE,
      refreshCookie: CUSTOMER_REFRESH_COOKIE,
    });
  },
};
