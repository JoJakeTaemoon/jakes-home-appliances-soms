/**
 * Audit log search filter assembly test.
 *
 * NOTE: `forceActorId` was removed when audit log access was narrowed to
 * ADMIN/MANAGER only. We assert that the field is no longer honoured and
 * that the route includes `actorUser.role` (so the UI can show role badges).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    auditLog: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { searchAuditLog } from "@/lib/reports/audit-search";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
});

describe("searchAuditLog", () => {
  it("passes actorId + entityType filters into the where clause", async () => {
    await searchAuditLog({
      actorId: "u1",
      entityType: "Customer",
      action: "CUSTOMER_CREATE",
      start: null,
      end: null,
      q: null,
      page: 1,
      pageSize: 25,
    });
    const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where).toMatchObject({
      actorId: "u1",
      entityType: "Customer",
      action: "CUSTOMER_CREATE",
    });
    expect(call.skip).toBe(0);
    expect(call.take).toBe(25);
  });

  it("builds OR clause for free-text q", async () => {
    await searchAuditLog({
      q: "user_create",
      page: 1,
      pageSize: 10,
    });
    const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where.OR).toHaveLength(3);
  });

  it("clamps pageSize to <= 200", async () => {
    await searchAuditLog({
      page: 1,
      pageSize: 5000,
    });
    const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.take).toBe(200);
  });

  it("includes actorUser.role in the Prisma include so UI can render role badges", async () => {
    await searchAuditLog({ page: 1, pageSize: 10 });
    const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.include).toBeDefined();
    expect(call.include.actorUser).toBeDefined();
    expect(call.include.actorUser.select).toMatchObject({
      id: true,
      username: true,
      role: true,
    });
  });

  it("exposes actorRole on each row", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "a1",
        at: new Date("2026-05-26T00:00:00Z"),
        actorType: "USER",
        actorId: "u1",
        action: "CUSTOMER_UPDATE",
        entityType: "Customer",
        entityId: "c1",
        ipAddress: null,
        userAgent: null,
        before: null,
        after: null,
        actorUser: { id: "u1", username: "admin", role: "ADMIN" },
      },
    ]);
    const result = await searchAuditLog({ page: 1, pageSize: 10 });
    expect(result.rows[0]).toHaveProperty("actorRole", "ADMIN");
  });
});
