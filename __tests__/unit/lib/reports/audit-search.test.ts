/**
 * Audit log search filter assembly test.
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

  it("forceActorId overrides actorId filter", async () => {
    await searchAuditLog({
      actorId: "u1",
      page: 1,
      pageSize: 10,
      forceActorId: "self-staff",
    });
    const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where.actorId).toBe("self-staff");
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
});
