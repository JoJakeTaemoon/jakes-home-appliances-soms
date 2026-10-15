/**
 * Resend adapter tests — pure dispatch, so these pin the wire format and the
 * error surface. Like the eSMS adapter, every failure is a thrown Error with
 * a readable message; `sendNotification()` turns it into a FAILED
 * NotificationLog row carrying that message.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ResendProvider } from "@/lib/notifications/resend-client";
import type { SendPayload } from "@/lib/notifications/types";

const payload = (over: Partial<SendPayload> = {}): SendPayload => ({
  channel: "EMAIL",
  to: "ops@example.vn",
  templateCode: "EMAIL_RECEIPT",
  locale: "vi",
  subject: "[Seoul Aqua] Biên lai thanh toán",
  body: "Kính chào Nguyễn Văn A,\n\nThanh toán đã được ghi nhận.",
  ...over,
});

function mockFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => {
      if (typeof body === "string") throw new SyntaxError("Unexpected token");
      return body;
    },
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("ResendProvider", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
  });

  it("posts to the Resend emails endpoint and returns the message id", async () => {
    const spy = mockFetch(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    const res = await new ResendProvider().send(payload());

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const sent = JSON.parse(init.body as string);
    expect(sent.from).toBe("Seoul Aqua <noreply@seoulaqua.com.vn>");
    expect(sent.reply_to).toBe("cs@seoulaqua.com.vn");
    expect(sent.to).toEqual(["ops@example.vn"]);
    expect(sent.subject).toBe("[Seoul Aqua] Biên lai thanh toán");
    expect(sent.text).toBe(payload().body);

    expect(res.providerMessageId).toBe("49a3999c-0ce1-4ea6-ab68-afcd6dc2e794");
    expect(res.dryRun).toBeFalsy();
  });

  it("takes the sender and reply-to from EMAIL_FROM / EMAIL_REPLY_TO", async () => {
    process.env.EMAIL_FROM = "SOMS <soms@seoulaqua.com.vn>";
    process.env.EMAIL_REPLY_TO = "help@seoulaqua.com.vn";
    const spy = mockFetch(200, { id: "x" });
    await new ResendProvider().send(payload());
    const sent = JSON.parse(spy.mock.calls[0][1].body as string);
    expect(sent.from).toBe("SOMS <soms@seoulaqua.com.vn>");
    expect(sent.reply_to).toBe("help@seoulaqua.com.vn");
  });

  it("throws a readable error carrying Resend's message on a 4xx", async () => {
    mockFetch(422, {
      statusCode: 422,
      name: "validation_error",
      message: "Invalid `to` field.",
    });
    await expect(new ResendProvider().send(payload())).rejects.toThrow(
      /Resend HTTP 422.*validation_error.*Invalid `to` field/,
    );
  });

  it("names the API key when Resend rejects it", async () => {
    mockFetch(401, { statusCode: 401, name: "missing_api_key", message: "Missing API key" });
    await expect(new ResendProvider().send(payload())).rejects.toThrow(
      /401.*RESEND_API_KEY/,
    );
  });

  it("still reports the status when the error body is not JSON", async () => {
    mockFetch(502, "<html>Bad Gateway</html>");
    await expect(new ResendProvider().send(payload())).rejects.toThrow(
      /Resend HTTP 502/,
    );
  });

  it("wraps a network failure in a readable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await expect(new ResendProvider().send(payload())).rejects.toThrow(
      /Resend request failed.*fetch failed/,
    );
  });

  it("fails clearly without calling Resend when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const spy = mockFetch(200, { id: "x" });
    await expect(new ResendProvider().send(payload())).rejects.toThrow(
      /RESEND_API_KEY is not set/,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses an SMS payload instead of emailing a phone number", async () => {
    mockFetch(200, { id: "x" });
    await expect(
      new ResendProvider().send(payload({ channel: "SMS", to: "0901888484" })),
    ).rejects.toThrow(/EMAIL/);
  });
});
