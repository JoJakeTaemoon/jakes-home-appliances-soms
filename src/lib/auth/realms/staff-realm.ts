/**
 * Staff realm — concrete `AuthRealm` for HQ users (`User` model).
 *
 * Cookies: `officeAccessToken` / `officeRefreshToken` (Path=/).
 * JWT aud: `staff` (legacy value, retained while the office cookie rename
 * lands — see docs/URL_SCHEME.md §5).
 * Refresh TTL: 7 days.
 * Lockout: sliding window via `LoginAttempt` rows (5 fails / 15min → 15min lock).
 */

import type { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  signStaffAccessToken,
  signStaffRefreshToken,
  verifyAccessToken,
  STAFF_REFRESH_TTL_SECONDS,
  type StaffJwtPayload,
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

export const STAFF_ACCESS_COOKIE = "officeAccessToken";
export const STAFF_REFRESH_COOKIE = "officeRefreshToken";

/** Hydrated staff actor returned by `requireAuth(staffRealm, …)`. */
export interface AuthenticatedStaff extends StaffJwtPayload {
  userId: string; // alias of sub for callsite ergonomics
  email: string | null;
  phone: string | null;
  preferredRegion: string | null;
  mustChangePassword: boolean;
}

// ── Lockout adapter — sliding-window via LoginAttempt rows ───────────────

const staffLockout: AuthRealmLockout = {
  async loadCounters(actorId): Promise<LockoutCounters | null> {
    const row = await prisma.user.findUnique({
      where: { id: actorId },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    return row ? { failedLoginCount: row.failedLoginCount, lockedUntil: row.lockedUntil } : null;
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

    // Count failures inside the sliding window — stale fails from yesterday
    // do not contribute to today's lockout.
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

// ── Session adapter — `Session` model ────────────────────────────────────

const staffSession: AuthRealmSession = {
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

// ── Realm ────────────────────────────────────────────────────────────────

export const staffRealm: AuthRealm<AuthenticatedStaff> = {
  audience: "staff",
  accessCookie: STAFF_ACCESS_COOKIE,
  refreshCookie: STAFF_REFRESH_COOKIE,
  accessTtlSec: ACCESS_COOKIE_MAX_AGE,
  refreshTtlSec: STAFF_REFRESH_TTL_SECONDS,

  async signAccessToken(actor) {
    return signStaffAccessToken({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
    });
  },

  async signRefreshToken({ actorId, sessionId }) {
    return signStaffRefreshToken({ userId: actorId, sessionId });
  },

  async hydrateFromAccessToken(token) {
    let payload: StaffJwtPayload;
    try {
      payload = await verifyAccessToken(token, "staff");
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
    return {
      sub: row.user.id,
      username: row.user.username,
      role: row.user.role as StaffRole,
      aud: "staff",
      userId: row.user.id,
      email: row.user.email ?? null,
      phone: row.user.phone ?? null,
      preferredRegion: row.user.preferredRegion ?? null,
      mustChangePassword: row.user.mustChangePassword,
    };
  },

  lockout: staffLockout,
  session: staffSession,

  setCookies(response: NextResponse, tokens) {
    writeAuthCookies(response, {
      accessCookie: STAFF_ACCESS_COOKIE,
      refreshCookie: STAFF_REFRESH_COOKIE,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessMaxAge: ACCESS_COOKIE_MAX_AGE,
      refreshMaxAge: STAFF_REFRESH_TTL_SECONDS,
    });
  },

  clearCookies(response: NextResponse) {
    eraseAuthCookies(response, {
      accessCookie: STAFF_ACCESS_COOKIE,
      refreshCookie: STAFF_REFRESH_COOKIE,
    });
  },
};
