/**
 * eSMS adapter tests — the provider contract is pure dispatch, so these pin
 * the wire format and the error surface, not any DB behaviour.
 *
 *   - Request shape: SmsType=2 CSKH, registered Brandname, normalized phone.
 *   - `IsUnicode` is derived from the body (the approved bodies are ASCII).
 *   - `CodeResult` other than "100" throws with a human-readable reason —
 *     146 in particular means the CSKH body is not registered with eSMS,
 *     which is the expected outcome for the six templates that are still
 *     pending registration.
 *   - Sandbox mode reports `dryRun` so the orchestrator logs MOCKED rather
 *     than claiming a delivery that never left eSMS.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ESmsProvider, toEsmsPhone } from "@/lib/notifications/esms-client";
import type { SendPayload } from "@/lib/notifications/types";

const payload = (over: Partial<SendPayload> = {}): SendPayload => ({
  channel: "SMS",
  to: "+84 90 188 8484",
  templateCode: "SMS_VISIT_REMINDER",
  locale: "vi",
  body: "TB BAO TRI DINH KY: KTV cua JAKE'S HOME APPLIANCES du kien se den bao tri May loc nuoc cua QK vao 13/09/2026 09:00.",
  ...over,
});

function mockFetch(json: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => json,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sentBody(spy: ReturnType<typeof mockFetch>): Record<string, string> {
  return JSON.parse(spy.mock.calls[0][1].body as string);
}

describe("toEsmsPhone", () => {
  it("normalizes every stored format to a local 0-leading number", () => {
    expect(toEsmsPhone("+84 90 188 8484")).toBe("0901888484");
    expect(toEsmsPhone("84901888484")).toBe("0901888484");
    expect(toEsmsPhone("090-188-8484")).toBe("0901888484");
    expect(toEsmsPhone("(090) 188 8484")).toBe("0901888484");
    expect(toEsmsPhone("901888484")).toBe("0901888484");
  });
});

describe("ESmsProvider", () => {
  beforeEach(() => {
    process.env.ESMS_API_KEY = "test-api-key";
    process.env.ESMS_SECRET_KEY = "test-secret-key";
    process.env.ESMS_BRAND_NAME = "JAKE'S HOME APPLIANCES";
    process.env.ESMS_SANDBOX = "0";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ESMS_SANDBOX;
  });

  it("posts a CSKH request with the registered brandname and returns the SMSID", async () => {
    const spy = mockFetch({ CodeResult: "100", SMSID: "d8e0f1f07025" });
    const res = await new ESmsProvider().send(payload());

    const body = sentBody(spy);
    expect(body.ApiKey).toBe("test-api-key");
    expect(body.SecretKey).toBe("test-secret-key");
    expect(body.Brandname).toBe("JAKE'S HOME APPLIANCES");
    expect(body.SmsType).toBe("2");
    expect(body.Phone).toBe("0901888484");
    expect(body.IsUnicode).toBe("0");
    expect(body.Sandbox).toBe("0");
    expect(body.RequestId.length).toBeLessThanOrEqual(50);

    expect(res.providerMessageId).toBe("d8e0f1f07025");
    expect(res.segmentsUsed).toBe(1);
    expect(res.dryRun).toBeFalsy();
  });

  it("flags IsUnicode for a body carrying diacritics", async () => {
    const spy = mockFetch({ CodeResult: "100", SMSID: "x" });
    await new ESmsProvider().send(payload({ body: "Máy lọc nước đã sẵn sàng" }));
    expect(sentBody(spy).IsUnicode).toBe("1");
  });

  it("reports sandbox sends as dryRun so they log as MOCKED", async () => {
    process.env.ESMS_SANDBOX = "1";
    mockFetch({ CodeResult: "100", SMSID: "sandbox-1" });
    const res = await new ESmsProvider().send(payload());
    expect(res.dryRun).toBe(true);
  });

  it("throws a readable error when the CSKH body is not registered", async () => {
    mockFetch({ CodeResult: "146" });
    await expect(new ESmsProvider().send(payload())).rejects.toThrow(
      /146.*not registered/i,
    );
  });

  it("throws when credentials are rejected", async () => {
    mockFetch({ CodeResult: "101" });
    await expect(new ESmsProvider().send(payload())).rejects.toThrow(/101/);
  });

  it("throws when a credential env var is missing", async () => {
    delete process.env.ESMS_API_KEY;
    mockFetch({ CodeResult: "100", SMSID: "x" });
    await expect(new ESmsProvider().send(payload())).rejects.toThrow(
      /ESMS_API_KEY/,
    );
  });

  it("refuses a non-SMS payload instead of silently sending it", async () => {
    mockFetch({ CodeResult: "100", SMSID: "x" });
    await expect(
      new ESmsProvider().send(payload({ channel: "EMAIL" })),
    ).rejects.toThrow(/SMS/);
  });
});
