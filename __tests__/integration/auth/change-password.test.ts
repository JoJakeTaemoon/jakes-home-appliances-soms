/**
 * POST /api/auth/change-password (office) + /api/auth/field/change-password.
 *
 * Staff and technicians had no way to change their own password, so the
 * temp password an admin reads out by phone stayed forever. Mirrors the
 * portal route: current-password check, min 8, PASSWORD_REUSE, clears
 * mustChangePassword, revokes every session and mints a fresh one for the
 * caller, audited as PASSWORD_CHANGED / PASSWORD_CHANGE_FAILED.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { requireAuthMock, userFindUnique, userUpdate, createSession, revokeAll } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  createSession: vi.fn(),
  revokeAll: vi.fn(),
}));
vi.mock("@/lib/auth/core/guards", () => ({
  requireAuth: (realm: { audience: string }) => requireAuthMock(realm.audience),
}));
vi.mock("@/lib/auth/core/session", () => ({
  createSession: (realm: { audience: string }, a: unknown) => createSession(realm.audience, a),
  revokeAllSessionsForActor: (realm: { audience: string }, id: string) => revokeAll(realm.audience, id),
}));
vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: userFindUnique, update: userUpdate } },
}));

import { logAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { UnauthorizedError } from "@/lib/api/error";
import { POST as staffPOST } from "@/app/api/auth/change-password/route";
import { POST as fieldPOST } from "@/app/api/auth/field/change-password/route";

const CURRENT = "TempPw1234";
let currentHash = "";
beforeAll(async () => {
  currentHash = await hashPassword(CURRENT);
});

const REALMS = [
  { name: "office", audience: "staff", route: staffPOST, refreshCookie: "officeRefreshToken", role: "STAFF" },
  { name: "field", audience: "field", route: fieldPOST, refreshCookie: "fieldRefreshToken", role: "TECHNICIAN" },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ passwordHash: currentHash });
  userUpdate.mockResolvedValue({});
  createSession.mockResolvedValue({ sessionId: "s-new", refreshToken: "rt-new", expiresAt: new Date() });
  revokeAll.mockResolvedValue(2);
});

async function call(route: (r: NextRequest) => Promise<Response>, body: unknown) {
  const res = await route(
    new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
  return { res, status: res.status, json: await res.json() };
}

describe.each(REALMS)("$name change-password", ({ audience, route, refreshCookie, role }) => {
  beforeEach(() => {
    requireAuthMock.mockResolvedValue({ userId: "u1", username: "thu", role, mustChangePassword: true });
  });

  it("changes the password, clears mustChangePassword and re-issues the session", async () => {
    const { res, status } = await call(route, { currentPassword: CURRENT, newPassword: "BrandNew99" });

    expect(status).toBe(200);
    const upd = userUpdate.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "u1" });
    expect(upd.data.mustChangePassword).toBe(false);
    expect(await verifyPassword("BrandNew99", upd.data.passwordHash)).toBe(true);

    // Every old session dies (incl. one an attacker might hold), the caller gets a new one.
    expect(revokeAll).toHaveBeenCalledWith(audience, "u1");
    expect(createSession).toHaveBeenCalledWith(audience, expect.objectContaining({ actorId: "u1" }));
    expect(res.headers.get("set-cookie")).toContain(`${refreshCookie}=rt-new`);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PASSWORD_CHANGED", entityType: "User", entityId: "u1", actorId: "u1" }),
    );
  });

  it("rejects a wrong current password and audits the failure", async () => {
    const { status, json } = await call(route, { currentPassword: "nope-nope", newPassword: "BrandNew99" });
    expect(status).toBe(400);
    expect(json.error.code).toBe("WRONG_PASSWORD");
    expect(userUpdate).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PASSWORD_CHANGE_FAILED" }));
  });

  it("refuses re-using the current password", async () => {
    const { status, json } = await call(route, { currentPassword: CURRENT, newPassword: CURRENT });
    expect(status).toBe(400);
    expect(json.error.code).toBe("PASSWORD_REUSE");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses a new password under 8 characters", async () => {
    const { status } = await call(route, { currentPassword: CURRENT, newPassword: "short" });
    expect(status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    requireAuthMock.mockRejectedValueOnce(new UnauthorizedError());
    const { status } = await call(route, { currentPassword: CURRENT, newPassword: "BrandNew99" });
    expect(status).toBe(401);
  });
});
