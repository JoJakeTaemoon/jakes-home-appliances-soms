/**
 * Integration test for POST /api/auth/login.
 *
 * Hits the route handler directly with a hand-built NextRequest so we don't
 * need a running server. Uses the real DB — make sure DATABASE_URL points
 * at the dev database and that migrations are applied.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { LOCKOUT_THRESHOLD } from "@/lib/auth/lockout";

const TEST_USERNAME = "test_login_user";
const TEST_PASSWORD = "Correct-Horse-1!";
const WRONG_PASSWORD = "Wrong-Pony-2!";

async function callLogin(body: unknown) {
  const req = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "vitest",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify(body),
  });
  const res = await loginRoute(req);
  const json = (await res.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  return { status: res.status, json };
}

async function cleanupTestUser() {
  await prisma.loginAttempt.deleteMany({ where: { username: TEST_USERNAME } });
  const user = await prisma.user.findUnique({
    where: { username: TEST_USERNAME },
    select: { id: true },
  });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

beforeAll(() => {
  process.env.JWT_SECRET ??=
    "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??=
    "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";
});

beforeEach(async () => {
  await cleanupTestUser();
  await prisma.user.create({
    data: {
      username: TEST_USERNAME,
      email: `${TEST_USERNAME}@test.local`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "STAFF",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await cleanupTestUser();
  // No prisma.$disconnect — the singleton prisma client is shared with other
  // tests; closing it here would break parallel test files.
});

describe("POST /api/auth/login (integration)", () => {
  it("returns 200 + tokens on valid credentials", async () => {
    const { status, json } = await callLogin({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    const data = json.data as {
      user: { username: string; role: string };
      accessToken: string;
    };
    expect(data.user.username).toBe(TEST_USERNAME);
    expect(data.user.role).toBe("STAFF");
    expect(typeof data.accessToken).toBe("string");
    expect(data.accessToken.length).toBeGreaterThan(20);

    // Session row was created.
    const sessions = await prisma.session.findMany({
      where: { user: { username: TEST_USERNAME } },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].revokedAt).toBeNull();
  });

  it("returns 401 on wrong password", async () => {
    const { status, json } = await callLogin({
      username: TEST_USERNAME,
      password: WRONG_PASSWORD,
    });
    expect(status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe("INVALID_CREDENTIALS");

    const user = await prisma.user.findUnique({
      where: { username: TEST_USERNAME },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    expect(user?.failedLoginCount).toBe(1);
    expect(user?.lockedUntil).toBeNull();
  });

  it("returns 401 on unknown username (no enumeration leak)", async () => {
    const { status, json } = await callLogin({
      username: "no_such_user_42",
      password: WRONG_PASSWORD,
    });
    expect(status).toBe(401);
    expect(json.error?.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 400 on invalid payload", async () => {
    const { status, json } = await callLogin({ username: "", password: "" });
    expect(status).toBe(400);
    expect(json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("locks the account after threshold failed attempts", async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await callLogin({ username: TEST_USERNAME, password: WRONG_PASSWORD });
    }
    // The Nth wrong-password attempt should itself return ACCOUNT_LOCKED
    // because the lockout is applied inside that same request.
    const user = await prisma.user.findUnique({
      where: { username: TEST_USERNAME },
      select: { lockedUntil: true, failedLoginCount: true },
    });
    expect(user?.failedLoginCount).toBe(LOCKOUT_THRESHOLD);
    expect(user?.lockedUntil).not.toBeNull();
    expect(user?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    // A subsequent attempt — even with the CORRECT password — must be
    // refused while the lockout is active.
    const followup = await callLogin({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    expect(followup.status).toBe(423);
    expect(followup.json.error?.code).toBe("ACCOUNT_LOCKED");
  });

  it("returns 403 ACCOUNT_INACTIVE for disabled users", async () => {
    await prisma.user.update({
      where: { username: TEST_USERNAME },
      data: { status: "DISABLED" },
    });
    const { status, json } = await callLogin({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    expect(status).toBe(403);
    expect(json.error?.code).toBe("ACCOUNT_INACTIVE");
  });
});
