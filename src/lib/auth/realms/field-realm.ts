/**
 * Field realm — concrete `AuthRealm` for technicians (`User` model with
 * `role = TECHNICIAN`).
 *
 * Cookies: `fieldAccessToken` / `fieldRefreshToken` (Path=/).
 * JWT aud: `field`.
 * Refresh TTL: 7 days.
 * Lockout: shares the User table + LoginAttempt rows with the staff realm
 *          (one User row → one set of failed-login counters regardless of
 *          which realm tried to authenticate).
 *
 * Same DB table as `staff-realm`, but the realm refuses any role other than
 * TECHNICIAN — keeping office staff out of the field cookies and vice versa.
 */

import type { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  signFieldAccessToken,
  signFieldRefreshToken,
  verifyAccessToken,
  FIELD_REFRESH_TTL_SECONDS,
  type FieldJwtPayload,
} from "@/lib/auth/jwt";
import {
  ACCESS_COOKIE_MAX_AGE,
  writeAuthCookies,
  eraseAuthCookies,
} from "@/lib/auth/core/cookies";
import {
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MS,
  LOCKOUT_DURATION_MS,
} from "@/lib/auth/realm";
import type {
  AuthRealm,
  AuthRealmLockout,
  AuthRealmSession,
  AttemptContext,
  LockoutCounters,
  SessionRecord,
} from "@/lib/auth/realm";
import type { StaffRole } from "@/lib/auth/roles";

export const FIELD_ACCESS_COOKIE = "fieldAccessToken";
export const FIELD_REFRESH_COOKIE = "fieldRefreshToken";

/** Hydrated technician actor returned by `requireAuth(fieldRealm, …)`. */
export interface AuthenticatedField extends FieldJwtPayload {
  userId: string; // alias of sub for callsite ergonomics
  email: string | null;
  phone: string | null;
  preferredRegion: string | null;
  mustChangePassword: boolean;
}

// ── Lockout adapter ─────────────────────────────────────────────────────
//
// Shares the User + LoginAttempt rows with staff-realm. A technician hammering
// `/api/auth/field/login` and an admin hammering `/api/auth/login` against
// the same User row both contribute to the same failure window.

const fieldLockout: AuthRealmLockout = {
  async loadCounters(actorId): Promise<LockoutCounters | null> {
    const row = await prisma.user.findUnique({
      where: { id: actorId },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    return row
      ? { failedLoginCount: row.failedLoginCount, lockedUntil: row.lockedUntil }
      : null;
  },

  async recordSuccess(ctx: AttemptContext): Promise<void> {
    await prisma.loginAttempt.create({
      data: {
        username: ctx.identifier,
        userId: ctx.actorId ?? null,
        success: true,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
    if (!ctx.actorId) return;
    await prisma.user.update({
      where: { id: ctx.actorId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  },

  async recordFailure(ctx: AttemptContext): Promise<LockoutCounters | null> {
    await prisma.loginAttempt.create({
      data: {
        username: ctx.identifier,
        userId: ctx.actorId ?? null,
        success: false,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
    if (!ctx.actorId) return null;

    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const recentFails = await prisma.loginAttempt.count({
      where: {
        userId: ctx.actorId,
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
      where: { id: ctx.actorId },
      data: updates,
    });
    return {
      failedLoginCount: recentFails,
      lockedUntil: updates.lockedUntil ?? null,
    };
  },
};

// ── Session adapter ─────────────────────────────────────────────────────
//
// Field sessions also live in the `Session` table — separating them into
// their own table would buy nothing because revocation queries already key
// by userId. The realm boundary is enforced at the cookie + audience layer.

const fieldSession: AuthRealmSession = {
  async create({ actorId, refreshToken, userAgent, ipAddress, expiresAt }) {
    return prisma.session.create({
      data: {
        userId: actorId,
        refreshToken,
        userAgent: userAgent ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt,
      },
      select: { id: true },
    });
  },

  async updateRefreshToken(sessionId, refreshToken) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { refreshToken },
    });
  },

  async findValid(refreshToken): Promise<SessionRecord | null> {
    const row = await prisma.session.findUnique({
      where: { refreshToken },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return {
      id: row.id,
      actorId: row.userId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  },

  async revoke(refreshToken): Promise<boolean> {
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
  },

  async revokeAllForActor(actorId): Promise<number> {
    const result = await prisma.session.updateMany({
      where: { userId: actorId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },

  async rotate({ oldSessionId, actorId, placeholder, userAgent, ipAddress, expiresAt }) {
    return prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: oldSessionId },
        data: { revokedAt: new Date() },
      });
      const row = await tx.session.create({
        data: {
          userId: actorId,
          refreshToken: placeholder,
          userAgent: userAgent ?? null,
          ipAddress: ipAddress ?? null,
          expiresAt,
        },
        select: { id: true, userId: true },
      });
      return { id: row.id, actorId: row.userId };
    });
  },
};

// ── Realm ───────────────────────────────────────────────────────────────

export const fieldRealm: AuthRealm<AuthenticatedField> = {
  audience: "field",
  accessCookie: FIELD_ACCESS_COOKIE,
  refreshCookie: FIELD_REFRESH_COOKIE,
  accessTtlSec: ACCESS_COOKIE_MAX_AGE,
  refreshTtlSec: FIELD_REFRESH_TTL_SECONDS,

  async signAccessToken(actor) {
    return signFieldAccessToken({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
    });
  },

  async signRefreshToken({ actorId, sessionId }) {
    return signFieldRefreshToken({ userId: actorId, sessionId });
  },

  async hydrateFromAccessToken(token) {
    let payload: FieldJwtPayload;
    try {
      payload = await verifyAccessToken(token, "field");
    } catch {
      return null;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        role: true,
        preferredRegion: true,
        mustChangePassword: true,
      },
    });
    if (user?.status !== "ACTIVE") return null;
    if (user.role !== "TECHNICIAN") return null;
    return {
      ...payload,
      userId: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      preferredRegion: user.preferredRegion ?? null,
      mustChangePassword: user.mustChangePassword,
    };
  },

  async hydrateFromSessionId(sessionId) {
    const row = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            preferredRegion: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (!row || row.user.status !== "ACTIVE") return null;
    if (row.user.role !== "TECHNICIAN") return null;
    return {
      sub: row.user.id,
      username: row.user.username,
      role: row.user.role as StaffRole,
      aud: "field",
      userId: row.user.id,
      email: row.user.email ?? null,
      phone: row.user.phone ?? null,
      preferredRegion: row.user.preferredRegion ?? null,
      mustChangePassword: row.user.mustChangePassword,
    };
  },

  lockout: fieldLockout,
  session: fieldSession,

  setCookies(response: NextResponse, tokens) {
    writeAuthCookies(response, {
      accessCookie: FIELD_ACCESS_COOKIE,
      refreshCookie: FIELD_REFRESH_COOKIE,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessMaxAge: ACCESS_COOKIE_MAX_AGE,
      refreshMaxAge: FIELD_REFRESH_TTL_SECONDS,
    });
  },

  clearCookies(response: NextResponse) {
    eraseAuthCookies(response, {
      accessCookie: FIELD_ACCESS_COOKIE,
      refreshCookie: FIELD_REFRESH_COOKIE,
    });
  },
};
