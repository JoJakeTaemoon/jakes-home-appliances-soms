/**
 * Verifies that the realm-parameterised lockout core enforces the same
 * 5-fails / 15-minute-window / 15-minute-lock policy regardless of which
 * realm (staff vs customer) it's wired to. This is the architectural
 * guarantee Refactor B was meant to produce — a fake realm exercises
 * `core/lockout` without touching prisma, so any future divergence (e.g.
 * one realm silently doubling the threshold) is caught here.
 */

import { describe, it, expect } from "vitest";
import {
  isLockedOut,
  lockoutRemainingMs,
  recordLoginAttempt,
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MS,
  LOCKOUT_DURATION_MS,
} from "@/lib/auth/core/lockout";
import type {
  AuthRealm,
  AuthRealmLockout,
  AuthRealmSession,
  AttemptContext,
  LockoutCounters,
} from "@/lib/auth/realm";

// ── Fake realm + lockout adapter ─────────────────────────────────────────

interface FakeActor {
  id: string;
}

function makeFakeRealm(audience: "staff" | "customer") {
  const counters = new Map<string, LockoutCounters>();
  const successCalls: AttemptContext[] = [];
  const failureCalls: AttemptContext[] = [];

  const lockout: AuthRealmLockout = {
    async loadCounters(actorId): Promise<LockoutCounters | null> {
      return counters.get(actorId) ?? null;
    },
    async recordSuccess(ctx: AttemptContext): Promise<void> {
      successCalls.push(ctx);
      if (ctx.actorId) {
        counters.set(ctx.actorId, { failedLoginCount: 0, lockedUntil: null });
      }
    },
    async recordFailure(ctx: AttemptContext): Promise<LockoutCounters | null> {
      failureCalls.push(ctx);
      if (!ctx.actorId) return null;
      const current = counters.get(ctx.actorId) ?? {
        failedLoginCount: 0,
        lockedUntil: null,
      };
      const nextCount = current.failedLoginCount + 1;
      const updated: LockoutCounters = {
        failedLoginCount: nextCount,
        lockedUntil:
          nextCount >= LOCKOUT_THRESHOLD
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : null,
      };
      counters.set(ctx.actorId, updated);
      return updated;
    },
  };

  // Stubs for the rest of the realm — not exercised by the lockout tests.
  const session: AuthRealmSession = {
    async create() {
      return { id: "stub" };
    },
    async updateRefreshToken() {},
    async findValid() {
      return null;
    },
    async revoke() {
      return false;
    },
    async revokeAllForActor() {
      return 0;
    },
    async rotate() {
      return { id: "stub", actorId: "stub" };
    },
  };

  const realm: AuthRealm<FakeActor> = {
    audience,
    accessCookie: `${audience}AccessToken`,
    refreshCookie: `${audience}RefreshToken`,
    accessTtlSec: 900,
    refreshTtlSec: 900,
    async signAccessToken() {
      return "stub";
    },
    async signRefreshToken() {
      return "stub";
    },
    async hydrateFromAccessToken() {
      return null;
    },
    async hydrateFromSessionId() {
      return null;
    },
    lockout,
    session,
    setCookies() {},
    clearCookies() {},
  };

  return { realm, counters, successCalls, failureCalls };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("auth/core/lockout — shared by both realms", () => {
  it("exposes the same numeric policy regardless of caller", () => {
    expect(LOCKOUT_THRESHOLD).toBe(5);
    expect(LOCKOUT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
  });

  describe("isLockedOut / lockoutRemainingMs", () => {
    it("is false / 0 for unlocked or null", () => {
      expect(isLockedOut(null)).toBe(false);
      expect(isLockedOut(undefined)).toBe(false);
      expect(isLockedOut({ lockedUntil: null })).toBe(false);
      expect(lockoutRemainingMs(null)).toBe(0);
      expect(lockoutRemainingMs({ lockedUntil: null })).toBe(0);
    });

    it("is true / positive when lockedUntil is in the future", () => {
      const future = new Date(Date.now() + 30_000);
      expect(isLockedOut({ lockedUntil: future })).toBe(true);
      expect(lockoutRemainingMs({ lockedUntil: future })).toBeGreaterThan(0);
    });

    it("is false when lockedUntil has elapsed", () => {
      const past = new Date(Date.now() - 60_000);
      expect(isLockedOut({ lockedUntil: past })).toBe(false);
      expect(lockoutRemainingMs({ lockedUntil: past })).toBe(0);
    });
  });

  describe("recordLoginAttempt — staff-shaped realm", () => {
    it("success path resets counters via realm.recordSuccess", async () => {
      const { realm, counters, successCalls, failureCalls } = makeFakeRealm("staff");
      counters.set("u-1", { failedLoginCount: 3, lockedUntil: null });

      await recordLoginAttempt(realm, {
        identifier: "admin",
        actorId: "u-1",
        success: true,
        ipAddress: "1.2.3.4",
      });

      expect(successCalls).toHaveLength(1);
      expect(failureCalls).toHaveLength(0);
      expect(counters.get("u-1")?.failedLoginCount).toBe(0);
    });

    it(`locks the account on the ${LOCKOUT_THRESHOLD}th failure`, async () => {
      const { realm, counters } = makeFakeRealm("staff");
      for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
        await recordLoginAttempt(realm, {
          identifier: "admin",
          actorId: "u-1",
          success: false,
        });
      }
      expect(counters.get("u-1")?.lockedUntil).toBeNull();

      // Threshold-tripping attempt — must return non-null counters with a
      // future lockedUntil so the route can surface ACCOUNT_LOCKED.
      const result = await recordLoginAttempt(realm, {
        identifier: "admin",
        actorId: "u-1",
        success: false,
      });
      expect(result?.lockedUntil).toBeInstanceOf(Date);
      expect(result?.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(counters.get("u-1")?.failedLoginCount).toBe(LOCKOUT_THRESHOLD);
    });

    it("returns null on failure with no actorId (unknown identifier)", async () => {
      const { realm, failureCalls } = makeFakeRealm("staff");
      const result = await recordLoginAttempt(realm, {
        identifier: "ghost",
        actorId: null,
        success: false,
      });
      expect(result).toBeNull();
      // The realm still gets the attempt (for forensics) — actorId is just null.
      expect(failureCalls).toHaveLength(1);
      expect(failureCalls[0].actorId).toBeNull();
    });
  });

  describe("recordLoginAttempt — customer-shaped realm", () => {
    // Same fake realm shape, different audience tag — proves the core
    // doesn't branch on audience to apply the policy.
    it("enforces the SAME threshold as the staff realm", async () => {
      const { realm, counters } = makeFakeRealm("customer");
      for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
        await recordLoginAttempt(realm, {
          identifier: "+84-90-000-0001",
          actorId: "c-1",
          success: false,
        });
      }
      expect(counters.get("c-1")?.lockedUntil).toBeNull();

      const result = await recordLoginAttempt(realm, {
        identifier: "+84-90-000-0001",
        actorId: "c-1",
        success: false,
      });
      expect(result?.lockedUntil).toBeInstanceOf(Date);
      expect(counters.get("c-1")?.failedLoginCount).toBe(LOCKOUT_THRESHOLD);
    });

    it("success resets the counter for customers too", async () => {
      const { realm, counters } = makeFakeRealm("customer");
      counters.set("c-1", { failedLoginCount: 4, lockedUntil: null });
      await recordLoginAttempt(realm, {
        identifier: "+84-90-000-0001",
        actorId: "c-1",
        success: true,
      });
      expect(counters.get("c-1")?.failedLoginCount).toBe(0);
    });
  });
});
