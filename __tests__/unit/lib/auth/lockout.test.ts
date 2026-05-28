import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma BEFORE importing the SUT.
vi.mock("@/lib/prisma", () => ({
  default: {
    loginAttempt: {
      create: vi.fn(),
      count: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import {
  isLockedOut,
  lockoutRemainingMs,
  recordLoginAttempt,
  LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_MS,
} from "@/lib/auth/lockout";

const mocked = prisma as unknown as {
  loginAttempt: { create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
};

describe("auth/lockout", () => {
  beforeEach(() => {
    mocked.loginAttempt.create.mockReset();
    mocked.loginAttempt.count.mockReset();
    mocked.user.update.mockReset();
    mocked.loginAttempt.create.mockResolvedValue({ id: "att-1" });
    mocked.user.update.mockResolvedValue({});
  });

  describe("isLockedOut", () => {
    it("is false when lockedUntil is null", () => {
      expect(isLockedOut({ lockedUntil: null })).toBe(false);
      expect(isLockedOut(null)).toBe(false);
      expect(isLockedOut(undefined)).toBe(false);
    });

    it("is true when lockedUntil is in the future", () => {
      const future = new Date(Date.now() + 60_000);
      expect(isLockedOut({ lockedUntil: future })).toBe(true);
    });

    it("is false when lockedUntil has expired", () => {
      const past = new Date(Date.now() - 60_000);
      expect(isLockedOut({ lockedUntil: past })).toBe(false);
    });
  });

  describe("lockoutRemainingMs", () => {
    it("returns 0 when unlocked", () => {
      expect(lockoutRemainingMs({ lockedUntil: null })).toBe(0);
      expect(lockoutRemainingMs({ lockedUntil: new Date(Date.now() - 1000) })).toBe(0);
    });

    it("returns positive value when locked", () => {
      const future = new Date(Date.now() + 30_000);
      const remaining = lockoutRemainingMs({ lockedUntil: future });
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(30_000);
    });
  });

  describe("recordLoginAttempt", () => {
    it("on success: resets counter + clears lockout + sets lastLoginAt", async () => {
      await recordLoginAttempt({
        username: "admin",
        userId: "u-1",
        success: true,
        ipAddress: "1.2.3.4",
      });
      expect(mocked.loginAttempt.create).toHaveBeenCalledTimes(1);
      const updateArgs = mocked.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: "u-1" });
      expect(updateArgs.data.failedLoginCount).toBe(0);
      expect(updateArgs.data.lockedUntil).toBeNull();
      expect(updateArgs.data.lastLoginAt).toBeInstanceOf(Date);
    });

    it("on unknown username: writes attempt row but no user update", async () => {
      await recordLoginAttempt({
        username: "ghost",
        success: false,
      });
      expect(mocked.loginAttempt.create).toHaveBeenCalledTimes(1);
      expect(mocked.user.update).not.toHaveBeenCalled();
    });

    it("on failure below threshold: increments counter but does not lock", async () => {
      mocked.loginAttempt.count.mockResolvedValueOnce(3);
      await recordLoginAttempt({
        username: "admin",
        userId: "u-1",
        success: false,
      });
      expect(mocked.user.update).toHaveBeenCalledTimes(1);
      const data = mocked.user.update.mock.calls[0][0].data;
      expect(data.failedLoginCount).toBe(3);
      expect(data.lockedUntil).toBeUndefined();
    });

    it(`on ${LOCKOUT_THRESHOLD}th failure: locks the account`, async () => {
      mocked.loginAttempt.count.mockResolvedValueOnce(LOCKOUT_THRESHOLD);
      const before = Date.now();
      await recordLoginAttempt({
        username: "admin",
        userId: "u-1",
        success: false,
      });
      const data = mocked.user.update.mock.calls[0][0].data;
      expect(data.failedLoginCount).toBe(LOCKOUT_THRESHOLD);
      expect(data.lockedUntil).toBeInstanceOf(Date);
      const lockMs = (data.lockedUntil as Date).getTime();
      // Should be roughly LOCKOUT_DURATION_MS in the future.
      expect(lockMs).toBeGreaterThanOrEqual(before + LOCKOUT_DURATION_MS - 100);
      expect(lockMs).toBeLessThanOrEqual(Date.now() + LOCKOUT_DURATION_MS + 100);
    });
  });
});
