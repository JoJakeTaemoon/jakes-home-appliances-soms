/**
 * Phase 3.5 — Customer portal auth integration tests.
 *
 * Exercises the route handlers directly with hand-built NextRequests:
 *   - login (success, wrong pw, lockout, mustChangePassword, multi-candidate)
 *   - password-reset (rotates pw + sends mock SMS + revokes sessions)
 *   - change-password (clears mustChangePassword flag)
 *   - portal-enable provisions credentials via mock SMS
 *
 * Uses the real DB; cleans up after itself. Notification provider stays on
 * the default mock implementation so the test never depends on external
 * services. Mock writes NotificationLog rows we assert on.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

import { POST as portalLogin } from "@/app/api/portal/auth/login/route";
import { POST as portalPasswordReset } from "@/app/api/portal/auth/password-reset/route";
import { POST as portalChangePassword } from "@/app/api/portal/auth/change-password/route";
import { GET as portalMe } from "@/app/api/portal/auth/me/route";
import { enablePortalAccount } from "@/lib/auth/portal-enable";

const TEST_CUSTOMER_CODE = "PRTLTST-P35";
const PHONE_A = "0911000001";
const PHONE_SHARED = "0911000099"; // shared phone scenario (A.13)
const NAME_A = "Test Portal A";
const NAME_B1 = "Shared User 1";
const NAME_B2 = "Shared User 2";

async function buildReq(url: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "vitest-portal",
    "x-forwarded-for": "10.0.0.99",
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function readJson(res: Response) {
  const status = res.status;
  const body = (await res.json()) as {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { code?: string; message?: string };
  };
  return { status, body };
}

let customerId = "";

async function cleanupTestData() {
  // Cascades to contacts + sessions + equipment.
  await prisma.customer.deleteMany({
    where: { code: TEST_CUSTOMER_CODE },
  });
  // Standalone audit/notification rows.
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { action: { startsWith: "PORTAL_" } },
        { action: { startsWith: "NOTIFICATION_" } },
      ],
      entityType: { in: ["CustomerContact", "NotificationLog"] },
    },
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET ??=
    "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??=
    "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";

  await cleanupTestData();
});

beforeEach(async () => {
  await cleanupTestData();
  const cust = await prisma.customer.create({
    data: {
      code: TEST_CUSTOMER_CODE,
      type: "B2C",
      name: "Portal Test Household",
    },
  });
  customerId = cust.id;
});

afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/portal/auth/login", () => {
  it("returns 401 on unknown phone (no enumeration)", async () => {
    const req = await buildReq("/api/portal/auth/login", "POST", {
      phone: "0000000000",
      password: "x",
    });
    const { status, body } = await readJson(await portalLogin(req));
    expect(status).toBe(401);
    expect(body.error?.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 on wrong password and increments counter", async () => {
    const pwHash = await hashPassword("CorrectPW1!");
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_A,
        phone1: PHONE_A,
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
      },
    });

    const res = await readJson(
      await portalLogin(
        await buildReq("/api/portal/auth/login", "POST", {
          phone: PHONE_A,
          password: "WrongPW1!",
        }),
      ),
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("INVALID_CREDENTIALS");

    const after = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    expect(after?.failedLoginCount).toBe(1);
    expect(after?.lockedUntil).toBeNull();
  });

  it("returns 200 + mustChangePassword on first login", async () => {
    const pwHash = await hashPassword("CorrectPW1!");
    await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_A,
        phone1: PHONE_A,
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
        mustChangePassword: true,
      },
    });

    const res = await readJson(
      await portalLogin(
        await buildReq("/api/portal/auth/login", "POST", {
          phone: PHONE_A,
          password: "CorrectPW1!",
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as {
      accessToken: string;
      mustChangePassword: boolean;
    };
    expect(data.mustChangePassword).toBe(true);
    expect(typeof data.accessToken).toBe("string");
  });

  it("locks after 5 failed attempts", async () => {
    const pwHash = await hashPassword("CorrectPW1!");
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_A,
        phone1: PHONE_A,
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
      },
    });

    for (let i = 0; i < 5; i++) {
      await portalLogin(
        await buildReq("/api/portal/auth/login", "POST", {
          phone: PHONE_A,
          password: "BadPW",
        }),
      );
    }
    const locked = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    expect(locked?.failedLoginCount).toBeGreaterThanOrEqual(5);
    expect(locked?.lockedUntil).not.toBeNull();

    // Correct pw is now refused while locked.
    const followup = await readJson(
      await portalLogin(
        await buildReq("/api/portal/auth/login", "POST", {
          phone: PHONE_A,
          password: "CorrectPW1!",
        }),
      ),
    );
    expect(followup.status).toBe(423);
    expect(followup.body.error?.code).toBe("ACCOUNT_LOCKED");
  });

  it("returns candidates list when phone shared by multiple contacts", async () => {
    // Two customers, both with a contact using PHONE_SHARED.
    const cust2 = await prisma.customer.create({
      data: { code: "PRTLTST-P35-2", type: "B2C", name: "Other Household" },
    });
    const pwHash = await hashPassword("CorrectPW1!");
    await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_B1,
        phone1: PHONE_SHARED,
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
      },
    });
    const c2 = await prisma.customerContact.create({
      data: {
        customerId: cust2.id,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_B2,
        phone1: PHONE_SHARED,
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
      },
    });

    const res = await readJson(
      await portalLogin(
        await buildReq("/api/portal/auth/login", "POST", {
          phone: PHONE_SHARED,
          password: "CorrectPW1!",
        }),
      ),
    );
    expect(res.status).toBe(200);
    const data = res.body.data as {
      candidates?: { id: string; name: string }[];
      accessToken?: string;
    };
    expect(data.candidates).toBeDefined();
    expect(data.candidates).toHaveLength(2);
    expect(data.accessToken).toBeUndefined();

    // Pick one + log in.
    const pick = await readJson(
      await portalLogin(
        await buildReq("/api/portal/auth/login", "POST", {
          phone: PHONE_SHARED,
          password: "CorrectPW1!",
          contactId: c2.id,
        }),
      ),
    );
    expect(pick.status).toBe(200);
    expect((pick.body.data as { accessToken: string }).accessToken).toBeTruthy();

    // cleanup
    await prisma.customer.delete({ where: { id: cust2.id } });
  });
});

describe("POST /api/portal/auth/password-reset", () => {
  it("rotates password + sends mock SMS + revokes sessions", async () => {
    const pwHash = await hashPassword("OldPW1234");
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_A,
        phone1: PHONE_A,
        email: "a@test.local",
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
      },
    });
    // Pre-existing session to be revoked.
    await prisma.customerSession.create({
      data: {
        contactId: contact.id,
        refreshToken: "test-refresh-" + Date.now(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const before = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: { passwordHash: true },
    });

    const res = await readJson(
      await portalPasswordReset(
        await buildReq("/api/portal/auth/password-reset", "POST", {
          phone: PHONE_A,
          name: NAME_A,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const after = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: { passwordHash: true, mustChangePassword: true },
    });
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    expect(after?.mustChangePassword).toBe(true);

    // Sessions revoked.
    const sessions = await prisma.customerSession.findMany({
      where: { contactId: contact.id, revokedAt: null },
    });
    expect(sessions).toHaveLength(0);

    // Mock SMS log written.
    const log = await prisma.notificationLog.findFirst({
      where: { contactId: contact.id, templateCode: "SMS_PASSWORD_RESET" },
    });
    expect(log).not.toBeNull();
    expect(log?.status).toBe("MOCKED");
    expect(log?.provider).toBe("mock");
  });

  it("returns 200 generic even on no match (no enumeration)", async () => {
    const res = await readJson(
      await portalPasswordReset(
        await buildReq("/api/portal/auth/password-reset", "POST", {
          phone: "0999000999",
          name: "Nobody",
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("requires name match (mismatched name returns 200 but does nothing)", async () => {
    const pwHash = await hashPassword("OldPW1234");
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_A,
        phone1: PHONE_A,
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
      },
    });
    const before = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: { passwordHash: true },
    });

    const res = await readJson(
      await portalPasswordReset(
        await buildReq("/api/portal/auth/password-reset", "POST", {
          phone: PHONE_A,
          name: "Wrong Name",
        }),
      ),
    );
    expect(res.status).toBe(200);

    const after = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: { passwordHash: true },
    });
    expect(after?.passwordHash).toBe(before?.passwordHash);
  });
});

describe("Change password + me flow", () => {
  it("change-password clears mustChangePassword and rejects wrong current", async () => {
    const pwHash = await hashPassword("CurrentPW123");
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_A,
        phone1: PHONE_A,
        language: "vi",
        portalEnabled: true,
        passwordHash: pwHash,
        mustChangePassword: true,
      },
    });

    // Log in to get an access token.
    const loginRes = await readJson(
      await portalLogin(
        await buildReq("/api/portal/auth/login", "POST", {
          phone: PHONE_A,
          password: "CurrentPW123",
        }),
      ),
    );
    const accessToken = (loginRes.body.data as { accessToken: string }).accessToken;

    // Wrong current pw → 400
    const wrong = await readJson(
      await portalChangePassword(
        await buildReq(
          "/api/portal/auth/change-password",
          "POST",
          { currentPassword: "NotIt", newPassword: "NewPassword123" },
          accessToken,
        ),
      ),
    );
    expect(wrong.status).toBe(400);
    expect(wrong.body.error?.code).toBe("WRONG_PASSWORD");

    // Correct flow
    const ok = await readJson(
      await portalChangePassword(
        await buildReq(
          "/api/portal/auth/change-password",
          "POST",
          {
            currentPassword: "CurrentPW123",
            newPassword: "BrandNewPW123",
          },
          accessToken,
        ),
      ),
    );
    expect(ok.status).toBe(200);

    const after = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: { mustChangePassword: true, passwordHash: true },
    });
    expect(after?.mustChangePassword).toBe(false);
    expect(after?.passwordHash).not.toBe(pwHash);

    // /me reflects the cleared flag
    const me = await readJson(
      await portalMe(
        await buildReq("/api/portal/auth/me", "GET", undefined, accessToken),
      ),
    );
    expect(me.status).toBe(200);
    expect(
      (me.body.data as { contact: { mustChangePassword: boolean } }).contact
        .mustChangePassword,
    ).toBe(false);
  });
});

describe("enablePortalAccount", () => {
  it("auto-provisions credentials + sends mock SMS welcome (+ email when present)", async () => {
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        name: NAME_A,
        phone1: PHONE_A,
        email: "welcome@test.local",
        language: "vi",
        portalEnabled: false,
      },
    });

    const { plainPassword } = await enablePortalAccount({
      contactId: contact.id,
      actorType: "USER",
      actorId: null,
    });

    expect(plainPassword).toHaveLength(10);

    const after = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: {
        portalEnabled: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });
    expect(after?.portalEnabled).toBe(true);
    expect(after?.mustChangePassword).toBe(true);
    expect(after?.passwordHash).toBeTruthy();

    const sms = await prisma.notificationLog.findFirst({
      where: { contactId: contact.id, templateCode: "SMS_PORTAL_WELCOME" },
    });
    expect(sms?.status).toBe("MOCKED");
    const email = await prisma.notificationLog.findFirst({
      where: { contactId: contact.id, templateCode: "EMAIL_PORTAL_WELCOME" },
    });
    expect(email?.status).toBe("MOCKED");
  });

  it("rejects contact without phone1", async () => {
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "OPS_CONTACT",
        scope: "CUSTOMER",
        name: "No Phone",
        phone1: "0900000000", // create with a phone (required col)
        email: null,
        language: "vi",
      },
    });
    // Clear phone1 to test the helper's check.
    await prisma.customerContact.update({
      where: { id: contact.id },
      data: { phone1: "" },
    });
    await expect(
      enablePortalAccount({ contactId: contact.id, actorType: "USER" }),
    ).rejects.toThrow(/no phone1/i);
  });
});
