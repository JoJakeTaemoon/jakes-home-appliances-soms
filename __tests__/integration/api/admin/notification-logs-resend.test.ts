/**
 * POST /api/admin/notification-logs/:id/resend
 *
 * Pins the three decisions the route makes:
 *   - Only FAILED rows are retried. A SKIPPED row was withheld on purpose
 *     (opt-out, or no usable phone/email) and must not be pushed through.
 *   - The retry goes back through `sendNotification()` with the original
 *     template + vars, so it re-renders from the current template rather than
 *     replaying the stored body.
 *   - Rows with no contact row fall back to the recipient the original
 *     attempt used, routed to the channel that attempt used.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuthMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireAuth: (req: NextRequest) => requireAuthMock(req),
}));

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: { notificationLog: { findUnique: (args: unknown) => findUniqueMock(args) } },
}));

const sendNotificationMock = vi.fn();
vi.mock("@/lib/notifications/send", () => ({
  sendNotification: (input: unknown) => sendNotificationMock(input),
}));

import { POST as resendRoute } from "@/app/api/admin/notification-logs/[id]/resend/route";

const FAILED_ROW = {
  id: "log-1",
  status: "FAILED",
  templateCode: "SMS_VISIT_REMINDER",
  channel: "SMS",
  locale: "vi",
  recipient: "0901888484",
  customerId: "cus-1",
  contactId: "contact-1",
  payload: { vars: { equipment: "May loc nuoc", datetime: "13/09/2026 09:00" } },
};

function call(id = "log-1") {
  const req = new NextRequest(
    `http://localhost/api/admin/notification-logs/${id}/resend`,
    { method: "POST" },
  );
  return resendRoute(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: "user-1", role: "ADMIN" });
  sendNotificationMock.mockResolvedValue([
    { notificationLogId: "log-2", status: "SENT" },
  ]);
});

describe("notification log resend", () => {
  it("re-sends a failed row through the orchestrator with its original vars", async () => {
    findUniqueMock.mockResolvedValue(FAILED_ROW);

    const res = await call();
    expect(res.status).toBe(200);

    const input = sendNotificationMock.mock.calls[0][0];
    expect(input.templateCode).toBe("SMS_VISIT_REMINDER");
    expect(input.customerContactId).toBe("contact-1");
    expect(input.vars).toEqual(FAILED_ROW.payload.vars);
    expect(input.locale).toBe("vi");
    expect(input.actorId).toBe("user-1");
    expect(input.actorType).toBe("USER");

    const json = await res.json();
    expect(json.data.status).toBe("SENT");
    expect(json.data.resentFrom).toBe("log-1");
  });

  it("refuses to resend a SKIPPED row", async () => {
    findUniqueMock.mockResolvedValue({ ...FAILED_ROW, status: "SKIPPED" });

    const res = await call();
    expect(res.status).toBe(400);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("refuses to resend one that already succeeded", async () => {
    findUniqueMock.mockResolvedValue({ ...FAILED_ROW, status: "SENT" });

    const res = await call();
    expect(res.status).toBe(400);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("falls back to the original recipient when the row has no contact", async () => {
    findUniqueMock.mockResolvedValue({ ...FAILED_ROW, contactId: null });

    await call();

    const input = sendNotificationMock.mock.calls[0][0];
    expect(input.customerContactId).toBeUndefined();
    expect(input.contactOverride.phone1).toBe("0901888484");
    expect(input.contactOverride.email).toBeNull();
  });

  it("is closed to STAFF", async () => {
    requireAuthMock.mockResolvedValue({ userId: "user-2", role: "STAFF" });
    findUniqueMock.mockResolvedValue(FAILED_ROW);

    const res = await call();
    expect(res.status).toBe(403);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("404s an unknown log id", async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await call("nope");
    expect(res.status).toBe(404);
  });
});
