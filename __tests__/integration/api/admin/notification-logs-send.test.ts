/**
 * POST /api/admin/notification-logs/send — staff sending a registered template
 * by hand.
 *
 * Pins the contract the UI depends on:
 *   - Exactly one recipient channel: known contacts OR a raw phone, never
 *     both and never neither.
 *   - Several contacts fan out to one send each, so one refusal cannot hide
 *     the others, and each contact reads their own language.
 *   - Every template variable must be filled. An unfilled one would go out as
 *     the literal "{name}", which is worse than a rejected request.
 *   - `hq_phone` is never required from the caller: the server substitutes the
 *     company number from settings.
 *   - A provider refusal (eSMS answers CodeResult 146 for any body it has not
 *     registered) comes back as a FAILED result rather than an exception, so
 *     the screen can show the reason.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuthMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireAuth: (req: NextRequest) => requireAuthMock(req),
}));

const findManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    customerContact: { findMany: (args: unknown) => findManyMock(args) },
  },
}));

const sendNotificationMock = vi.fn();
vi.mock("@/lib/notifications/send", () => ({
  sendNotification: (input: unknown) => sendNotificationMock(input),
}));

import { POST as sendRoute } from "@/app/api/admin/notification-logs/send/route";

function call(body: unknown) {
  const req = new NextRequest("http://localhost/api/admin/notification-logs/send", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return sendRoute(req, { params: Promise.resolve({}) });
}

const VISIT_VARS = {
  equipment: "May loc nuoc PTS-2100",
  datetime: "13/09/2026 09:00",
};

/** A valid SMS_VISIT_REMINDER request, plus whatever the case overrides. */
function VISIT(over: Record<string, unknown> = {}) {
  return { templateCode: "SMS_VISIT_REMINDER", vars: VISIT_VARS, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: "user-1", role: "MANAGER" });
  findManyMock.mockResolvedValue([
    { id: "contact-1", language: "vi", phone1: "0901000001" },
  ]);
  sendNotificationMock.mockResolvedValue([
    { notificationLogId: "log-1", status: "SENT" },
  ]);
});

describe("ad-hoc message send", () => {
  it("passes the template and its variables through, letting the contact's own language win", async () => {
    const res = await call(VISIT({ customerContactIds: ["contact-1"] }));
    expect(res.status).toBe(200);

    const input = sendNotificationMock.mock.calls[0][0];
    expect(input.templateCode).toBe("SMS_VISIT_REMINDER");
    expect(input.customerContactId).toBe("contact-1");
    expect(input.vars).toEqual(VISIT_VARS);
    // No explicit locale — sendNotification falls back to contact.language.
    expect(input.locale).toBeUndefined();
    expect(input.actorId).toBe("user-1");
  });

  it("rejects an unknown template", async () => {
    const res = await call({ templateCode: "SMS_NOPE", vars: {}, phone: "0961122564" });
    expect(res.status).toBe(404);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("rejects a template whose variables are not all filled", async () => {
    const res = await call({
      templateCode: "SMS_VISIT_REMINDER",
      vars: { equipment: "May loc nuoc" },
      phone: "0961122564",
    });
    expect(res.status).toBe(400);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("does not ask the caller for hq_phone — the server fills it", async () => {
    // SMS_SR_REJECTED uses {req_no}, {reason} and {hq_phone}; supplying the
    // first two is enough.
    const res = await call({
      templateCode: "SMS_SR_REJECTED",
      vars: { req_no: "12345", reason: "Het bao hanh" },
      phone: "0961122564",
    });
    expect(res.status).toBe(200);
  });

  it("refuses an email-only template", async () => {
    const res = await call({
      templateCode: "EMAIL_RECEIPT",
      vars: {},
      phone: "0961122564",
    });
    expect(res.status).toBe(400);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("sends to a raw phone number when no contact is chosen", async () => {
    const res = await call(VISIT({ phone: "0961122564", locale: "en" }));
    expect(res.status).toBe(200);

    const input = sendNotificationMock.mock.calls[0][0];
    expect(input.contactOverride.phone1).toBe("0961122564");
    expect(input.contactOverride.customerId).toBeNull();
    expect(input.locale).toBe("en");
  });

  it("rejects a request carrying both contacts and a phone", async () => {
    const res = await call(
      VISIT({ customerContactIds: ["contact-1"], phone: "0961122564" }),
    );
    expect(res.status).toBe(400);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no recipient at all", async () => {
    const res = await call(VISIT());
    expect(res.status).toBe(400);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("reports a carrier refusal as FAILED with its reason", async () => {
    sendNotificationMock.mockResolvedValue([
      {
        notificationLogId: "log-2",
        status: "FAILED",
        errorMessage: "eSMS CodeResult 146: CSKH template not registered",
      },
    ]);

    const res = await call(VISIT({ phone: "0961122564" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.failed).toBe(1);
    expect(json.data.errorMessage).toMatch(/146/);
  });

  it("fans out to every picked contact and counts the split", async () => {
    findManyMock.mockResolvedValue([
      { id: "c1", language: "vi", phone1: "0901000001" },
      { id: "c2", language: "ko", phone1: "0901000002" },
    ]);
    sendNotificationMock
      .mockResolvedValueOnce([{ notificationLogId: "log-1", status: "SENT" }])
      .mockResolvedValueOnce([
        {
          notificationLogId: "log-2",
          status: "FAILED",
          errorMessage: "eSMS CodeResult 146: CSKH template not registered",
        },
      ]);

    const res = await call(VISIT({ customerContactIds: ["c1", "c2"] }));
    const json = await res.json();

    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(json.data.sent).toBe(1);
    expect(json.data.failed).toBe(1);
    expect(json.data.results).toHaveLength(2);
    expect(json.data.errorMessage).toMatch(/146/);
  });

  it("de-duplicates a contact picked twice", async () => {
    await call(VISIT({ customerContactIds: ["c1", "c1"] }));
    expect(findManyMock.mock.calls[0][0].where.id.in).toEqual(["c1"]);
  });

  it("is closed to STAFF", async () => {
    requireAuthMock.mockResolvedValue({ userId: "user-2", role: "STAFF" });

    const res = await call(VISIT({ phone: "0961122564" }));
    expect(res.status).toBe(403);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
