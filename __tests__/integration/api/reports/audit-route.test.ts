/**
 * RED — /api/reports/audit route permission narrowing.
 *
 * Audit log is now ADMIN/MANAGER only — STAFF & TECHNICIAN are 403.
 * The previous `forceActorId` STAFF self-scope is GONE.
 *
 * We also verify that:
 *   - `redact()` is applied to before/after before returning
 *   - `resolveEntityDisplays()` is called and `entityDisplay` is injected
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the role guard so we can control what role the caller has.
const requireRoleMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (req: NextRequest, roles: unknown) =>
    requireRoleMock(req, roles),
}));

// Mock the search helper — we just need to verify the route plumbs args.
const searchAuditLogMock = vi.fn();
vi.mock("@/lib/reports/audit-search", () => ({
  searchAuditLog: (input: unknown) => searchAuditLogMock(input),
}));

// Mock entity resolver — we want to verify it's wired in.
const resolveEntityDisplaysMock = vi.fn();
vi.mock("@/lib/audit/entity-resolver", () => ({
  resolveEntityDisplays: (pairs: unknown) => resolveEntityDisplaysMock(pairs),
}));

import { GET as auditRoute } from "@/app/api/reports/audit/route";
import { ForbiddenError } from "@/lib/api/error";

function buildReq(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/reports/audit${qs ? `?${qs}` : ""}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  searchAuditLogMock.mockResolvedValue({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
  });
  resolveEntityDisplaysMock.mockResolvedValue(new Map<string, string>());
});

describe("GET /api/reports/audit — permission narrowing", () => {
  it("requires ADMIN or MANAGER (passes only these roles to requireRole)", async () => {
    requireRoleMock.mockResolvedValue({
      userId: "admin1",
      username: "admin",
      role: "ADMIN",
    });
    await auditRoute(buildReq());
    expect(requireRoleMock).toHaveBeenCalledTimes(1);
    const rolesArg = requireRoleMock.mock.calls[0][1] as readonly string[];
    expect(rolesArg).toContain("ADMIN");
    expect(rolesArg).toContain("MANAGER");
    expect(rolesArg).not.toContain("STAFF");
    expect(rolesArg).not.toContain("TECHNICIAN");
  });

  it("rejects STAFF with 403", async () => {
    requireRoleMock.mockRejectedValue(new ForbiddenError("Forbidden"));
    const res = await auditRoute(buildReq());
    expect(res.status).toBe(403);
  });

  it("rejects TECHNICIAN with 403", async () => {
    requireRoleMock.mockRejectedValue(new ForbiddenError("Forbidden"));
    const res = await auditRoute(buildReq());
    expect(res.status).toBe(403);
  });
});

describe("GET /api/reports/audit — forceActorId removal", () => {
  it("never passes forceActorId, regardless of caller role", async () => {
    requireRoleMock.mockResolvedValue({
      userId: "mgr1",
      username: "manager",
      role: "MANAGER",
    });
    await auditRoute(buildReq());
    const input = searchAuditLogMock.mock.calls[0][0] as Record<string, unknown>;
    expect(input).not.toHaveProperty("forceActorId");
  });
});

describe("GET /api/reports/audit — output gating", () => {
  beforeEach(() => {
    requireRoleMock.mockResolvedValue({
      userId: "admin1",
      username: "admin",
      role: "ADMIN",
    });
  });

  it("redacts sensitive fields in before/after", async () => {
    searchAuditLogMock.mockResolvedValueOnce({
      rows: [
        {
          id: "a1",
          at: "2026-05-26T00:00:00.000Z",
          actorType: "USER",
          actorId: "u1",
          actorName: "admin",
          actorRole: "ADMIN",
          action: "USER_UPDATE",
          entityType: "User",
          entityId: "u2",
          ipAddress: null,
          userAgent: null,
          before: { username: "jake", passwordHash: "should-be-masked" },
          after: { username: "jake", passwordHash: "should-also-be-masked" },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    const res = await auditRoute(buildReq());
    const json = (await res.json()) as {
      success: boolean;
      data: {
        rows: Array<{ before: Record<string, string>; after: Record<string, string> }>;
      };
    };
    expect(json.success).toBe(true);
    expect(json.data.rows[0].before.passwordHash).not.toContain("should-be-masked");
    expect(json.data.rows[0].before.passwordHash).toMatch(/•|\*|REDACTED/);
    expect(json.data.rows[0].after.passwordHash).not.toContain("should-also-be-masked");
  });

  it("calls resolveEntityDisplays with the page's (entityType, entityId) pairs", async () => {
    searchAuditLogMock.mockResolvedValueOnce({
      rows: [
        {
          id: "a1",
          at: "2026-05-26T00:00:00.000Z",
          actorType: "USER",
          actorId: "u1",
          actorName: "admin",
          actorRole: "ADMIN",
          action: "CUSTOMER_UPDATE",
          entityType: "Customer",
          entityId: "c1",
          ipAddress: null,
          userAgent: null,
          before: null,
          after: null,
        },
        {
          id: "a2",
          at: "2026-05-26T00:00:00.000Z",
          actorType: "USER",
          actorId: "u1",
          actorName: "admin",
          actorRole: "ADMIN",
          action: "CONTRACT_CREATE",
          entityType: "Contract",
          entityId: "k1",
          ipAddress: null,
          userAgent: null,
          before: null,
          after: null,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });

    await auditRoute(buildReq());
    expect(resolveEntityDisplaysMock).toHaveBeenCalledTimes(1);
    const pairs = resolveEntityDisplaysMock.mock.calls[0][0] as Array<{
      entityType: string;
      entityId: string;
    }>;
    expect(pairs).toHaveLength(2);
    const norm = pairs.map((p) => `${p.entityType}:${p.entityId}`).sort();
    expect(norm).toEqual(["Contract:k1", "Customer:c1"]);
  });

  it("injects entityDisplay into each row from the resolver map", async () => {
    searchAuditLogMock.mockResolvedValueOnce({
      rows: [
        {
          id: "a1",
          at: "2026-05-26T00:00:00.000Z",
          actorType: "USER",
          actorId: "u1",
          actorName: "admin",
          actorRole: "ADMIN",
          action: "CUSTOMER_UPDATE",
          entityType: "Customer",
          entityId: "c1",
          ipAddress: null,
          userAgent: null,
          before: null,
          after: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    resolveEntityDisplaysMock.mockResolvedValueOnce(
      new Map<string, string>([["Customer:c1", "김철수"]]),
    );

    const res = await auditRoute(buildReq());
    const json = (await res.json()) as {
      data: { rows: Array<{ entityDisplay: string | null }> };
    };
    expect(json.data.rows[0].entityDisplay).toBe("김철수");
  });

  it("entityDisplay is null when the resolver has no entry", async () => {
    searchAuditLogMock.mockResolvedValueOnce({
      rows: [
        {
          id: "a1",
          at: "2026-05-26T00:00:00.000Z",
          actorType: "USER",
          actorId: "u1",
          actorName: "admin",
          actorRole: "ADMIN",
          action: "CUSTOMER_UPDATE",
          entityType: "Customer",
          entityId: "c1",
          ipAddress: null,
          userAgent: null,
          before: null,
          after: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    resolveEntityDisplaysMock.mockResolvedValueOnce(new Map<string, string>());

    const res = await auditRoute(buildReq());
    const json = (await res.json()) as {
      data: { rows: Array<{ entityDisplay: string | null }> };
    };
    expect(json.data.rows[0].entityDisplay).toBeNull();
  });
});
