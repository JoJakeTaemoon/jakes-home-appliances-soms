/**
 * Orchestrator tests — `sendNotification()` owns NotificationLog writes.
 *
 * Phase 3.5 deepening (refactor 2): the provider adapters were narrowed to
 * pure dispatch. The orchestrator is now the only place that writes
 * `NotificationLog` rows. These tests pin that contract:
 *
 *   - On a successful adapter call (`dryRun: false`) the orchestrator
 *     writes ONE NotificationLog row with `status='SENT'` even though the
 *     adapter itself never touched prisma.
 *   - When the adapter signals `dryRun: true` (mock) the row goes in with
 *     `status='MOCKED'`.
 *   - When the adapter throws the orchestrator writes a `status='FAILED'`
 *     row + AuditLog `NOTIFICATION_FAILED`.
 *   - When routing returns zero channels the orchestrator writes a
 *     `status='SKIPPED'` row + AuditLog `NOTIFICATION_SKIPPED`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    customerContact: { findUnique: vi.fn() },
    notificationLog: { create: vi.fn() },
    notificationTemplate: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications/send";
import {
  setNotificationProviderOverride,
  clearNotificationProviderOverrides,
} from "@/lib/notifications";
import type {
  NotificationProvider,
  ProviderDispatchResult,
  SendPayload,
} from "@/lib/notifications/types";

const mockedPrisma = vi.mocked(prisma, true);
const mockedLogAudit = vi.mocked(logAudit);

class FakeProvider implements NotificationProvider {
  public readonly name = "fake";
  public readonly sends: SendPayload[] = [];
  constructor(
    private readonly handler: (
      payload: SendPayload,
    ) => Promise<ProviderDispatchResult>,
  ) {}
  async send(payload: SendPayload): Promise<ProviderDispatchResult> {
    this.sends.push(payload);
    return this.handler(payload);
  }
}

const opsContact = {
  id: "contact-1",
  customerId: "cust-1",
  phone1: "0901234567",
  email: "lan@example.com",
  smsOptOut: false,
  emailOptOut: false,
  language: "vi",
};

beforeEach(() => {
  vi.clearAllMocks();
  clearNotificationProviderOverrides();
  // Default contact lookup
  mockedPrisma.customerContact.findUnique.mockResolvedValue(
    opsContact as never,
  );
  // No DB override for the template body.
  mockedPrisma.notificationTemplate.findUnique.mockResolvedValue(null as never);
  mockedPrisma.notificationLog.create.mockResolvedValue({
    id: "log-row-1",
  } as never);
});

describe("sendNotification orchestrator owns NotificationLog", () => {
  it("writes status=SENT when adapter returns dryRun=false", async () => {
    const fake = new FakeProvider(async () => ({
      providerMessageId: "esms-RID-42",
      segmentsUsed: 1,
      dryRun: false,
    }));
    setNotificationProviderOverride("SMS", fake);

    const out = await sendNotification({
      templateCode: "SMS_VISIT_REMINDER",
      customerContactId: "contact-1",
      vars: { name: "An", date: "2026-06-01", time: "09:00", technician: "Khoa", service: "MAINTENANCE", url: "/x" },
    });

    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("SENT");
    expect(out[0].providerMessageId).toBe("esms-RID-42");

    // Orchestrator wrote the log row (adapter did not).
    expect(mockedPrisma.notificationLog.create).toHaveBeenCalledTimes(1);
    const createArgs = mockedPrisma.notificationLog.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("SENT");
    expect(createArgs.data.provider).toBe("fake");
    expect(createArgs.data.providerMessageId).toBe("esms-RID-42");
    expect(createArgs.data.templateCode).toBe("SMS_VISIT_REMINDER");

    // Audit recorded once with NOTIFICATION_SENT.
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    expect(mockedLogAudit.mock.calls[0][0]).toMatchObject({
      action: "NOTIFICATION_SENT",
      entityType: "NotificationLog",
    });
  });

  it("writes status=MOCKED when adapter signals dryRun=true", async () => {
    const fake = new FakeProvider(async () => ({
      providerMessageId: "mock-abc",
      dryRun: true,
    }));
    setNotificationProviderOverride("SMS", fake);

    const out = await sendNotification({
      templateCode: "SMS_VISIT_REMINDER",
      customerContactId: "contact-1",
      vars: { name: "An", date: "2026-06-01", time: "09:00", technician: "Khoa", service: "MAINTENANCE", url: "/x" },
    });

    expect(out[0].status).toBe("MOCKED");
    const createArgs = mockedPrisma.notificationLog.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("MOCKED");
  });

  it("writes status=FAILED + audit when adapter throws", async () => {
    const fake = new FakeProvider(async () => {
      throw new Error("HTTP 503 from eSMS");
    });
    setNotificationProviderOverride("SMS", fake);

    const out = await sendNotification({
      templateCode: "SMS_VISIT_REMINDER",
      customerContactId: "contact-1",
      vars: { name: "An", date: "2026-06-01", time: "09:00", technician: "Khoa", service: "MAINTENANCE", url: "/x" },
    });

    expect(out[0].status).toBe("FAILED");
    expect(out[0].errorMessage).toContain("503");
    const createArgs = mockedPrisma.notificationLog.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("FAILED");
    expect(createArgs.data.errorMessage).toContain("503");
    expect(mockedLogAudit.mock.calls[0][0]).toMatchObject({
      action: "NOTIFICATION_FAILED",
    });
  });

  it("writes status=SKIPPED when routing yields zero channels", async () => {
    // Override contact to one that can't be reached at all.
    mockedPrisma.customerContact.findUnique.mockResolvedValue({
      ...opsContact,
      phone1: "",
      email: null,
    } as never);

    const out = await sendNotification({
      templateCode: "SMS_VISIT_REMINDER",
      customerContactId: "contact-1",
    });

    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("SKIPPED");
    const createArgs = mockedPrisma.notificationLog.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("SKIPPED");
    expect(createArgs.data.provider).toBe("router");
    expect(mockedLogAudit.mock.calls[0][0]).toMatchObject({
      action: "NOTIFICATION_SKIPPED",
    });
  });
});
