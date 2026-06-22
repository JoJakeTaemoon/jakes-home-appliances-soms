/**
 * SR message thread — AuditLog-backed conversation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    auditLog: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { appendSrMessage, listSrMessages } from "@/lib/service-requests/messages";

const logAuditMock = logAudit as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  logAuditMock.mockClear();
  logAuditMock.mockResolvedValue(undefined);
  (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockReset();
  (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("appendSrMessage", () => {
  it("rejects empty bodies", async () => {
    await expect(
      appendSrMessage({
        srId: "sr1",
        body: "   ",
        author: "CUSTOMER",
        actorId: "contact1",
        authorName: "Customer A",
      }),
    ).rejects.toThrow();
  });

  it("writes an audit row tagged SR_MESSAGE with the message body", async () => {
    await appendSrMessage({
      srId: "sr1",
      body: "Hello",
      author: "CUSTOMER",
      actorId: "contact1",
      authorName: "Customer A",
    });
    // CUSTOMER actors don't have a User.id, so actorId is null and the
    // contact id is recorded under `after.actorContactId` instead.
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SR_MESSAGE",
        entityType: "ServiceRequest",
        entityId: "sr1",
        actorType: "CUSTOMER",
        actorId: null,
        after: expect.objectContaining({
          message: "Hello",
          authorName: "Customer A",
          actorContactId: "contact1",
        }),
      }),
    );
  });

  it("maps office sender to USER actorType", async () => {
    await appendSrMessage({
      srId: "sr1",
      body: "Acknowledged",
      author: "OFFICE",
      actorId: "u1",
      authorName: "staff1",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "USER" }),
    );
  });
});

describe("listSrMessages", () => {
  it("translates audit rows into SrMessage", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "a1",
        at: new Date("2026-05-27T10:00:00Z"),
        actorType: "CUSTOMER",
        actorUser: null,
        after: { message: "Hi", authorName: "Customer A" },
      },
      {
        id: "a2",
        at: new Date("2026-05-27T10:05:00Z"),
        actorType: "USER",
        actorUser: { id: "u1", username: "staff1" },
        after: { message: "Got it", authorName: "staff1" },
      },
    ]);
    const out = await listSrMessages("sr1");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      author: "CUSTOMER",
      authorName: "Customer A",
      body: "Hi",
    });
    expect(out[1]).toMatchObject({
      author: "OFFICE",
      authorName: "staff1",
      body: "Got it",
    });
  });
});
