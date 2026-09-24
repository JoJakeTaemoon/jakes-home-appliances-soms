/**
 * POST /api/users/[id]/password-reset
 *
 * Staff have no self-service recovery (removed 2026-09-24), so this route is
 * the only way back in for a locked-out user. It pins three things:
 *   - the temp password comes back in the response body (read out by phone),
 *     never over SMS
 *   - resetting forces a password change and kills every live session
 *   - a MANAGER cannot reset an ADMIN — that would hand them the admin account
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuthMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireAuth: (req: NextRequest) => requireAuthMock(req),
}));

const findUniqueMock = vi.fn();
const updateMock = vi.fn();
const updateManyMock = vi.fn();
const transactionMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (args: unknown) => findUniqueMock(args),
      update: (args: unknown) => updateMock(args),
    },
    session: { updateMany: (args: unknown) => updateManyMock(args) },
    $transaction: (ops: unknown) => transactionMock(ops),
  },
}));

const logAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (args: unknown) => logAuditMock(args) }));

import { POST as resetRoute } from "@/app/api/users/[id]/password-reset/route";

async function call(id = "user-2") {
  const req = new NextRequest(
    `http://localhost/api/users/${id}/password-reset`,
    { method: "POST" },
  );
  const res = await resetRoute(req, { params: Promise.resolve({ id }) });
  return { status: res.status, body: (await res.json()) as {
    success: boolean;
    data?: { tempPassword: string; username: string };
  } };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: "user-1", role: "ADMIN" });
  findUniqueMock.mockResolvedValue({
    id: "user-2",
    username: "thu",
    role: "STAFF",
    status: "ACTIVE",
  });
  transactionMock.mockResolvedValue([]);
  logAuditMock.mockResolvedValue(undefined);
});

describe("admin staff password reset", () => {
  it("returns a temp password, forces a change, and revokes sessions", async () => {
    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.data?.tempPassword).toHaveLength(10);

    // Both writes go through one transaction.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const update = updateMock.mock.calls[0][0] as {
      data: { mustChangePassword: boolean; passwordHash: string; lockedUntil: null };
    };
    expect(update.data.mustChangePassword).toBe(true);
    expect(update.data.lockedUntil).toBeNull();
    // The hash is stored, never the plaintext.
    expect(update.data.passwordHash).not.toBe(body.data?.tempPassword);

    const revoke = updateManyMock.mock.calls[0][0] as {
      where: { userId: string; revokedAt: null };
    };
    expect(revoke.where.userId).toBe("user-2");

    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      action: "PASSWORD_RESET_BY_STAFF",
      entityType: "User",
      entityId: "user-2",
    });
  });

  it("refuses a MANAGER resetting an ADMIN", async () => {
    requireAuthMock.mockResolvedValue({ userId: "user-1", role: "MANAGER" });
    findUniqueMock.mockResolvedValue({
      id: "user-2",
      username: "boss",
      role: "ADMIN",
      status: "ACTIVE",
    });

    const { status } = await call();
    expect(status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("refuses a STAFF caller outright", async () => {
    requireAuthMock.mockResolvedValue({ userId: "user-1", role: "STAFF" });

    const { status } = await call();
    expect(status).toBe(403);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("404s on an unknown user", async () => {
    findUniqueMock.mockResolvedValue(null);

    const { status } = await call("nope");
    expect(status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
