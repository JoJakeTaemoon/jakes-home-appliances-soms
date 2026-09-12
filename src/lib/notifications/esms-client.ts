/**
 * eSMS.vn Brandname SMS provider (CSKH).
 *
 * Endpoint + payload follow the "Tin nhắn SMS OTP/CSKH" spec:
 *   https://developers.esms.vn/esms-api/ham-gui-tin/tin-nhan-sms-otp-cskh
 *
 * Account facts confirmed 2026-09-12 (ViHAT deployment sheet "ZBS Seoul"):
 *   - Brandname `JAKE'S HOME APPLIANCES` — approved, prepaid balance funded.
 *   - `SmsType=2` (CSKH / customer care).
 *   - Only the periodic-inspection body is registered with eSMS so far. Every
 *     other template comes back as `CodeResult=146` until ViHAT registers it;
 *     that surfaces here as a thrown error and the orchestrator writes a
 *     FAILED NotificationLog row naming the template.
 *
 * Zalo ZNS is deliberately not wired up. The account has one ZNS template
 * (TempID 601950) and eSMS offers a multi-channel endpoint that falls back
 * from Zalo to SMS, but the decision (2026-09-12) is SMS-only for now.
 *
 * Pure dispatch per the `NotificationProvider` contract — the orchestrator in
 * `send.ts` owns every `NotificationLog` write.
 */

import { createHash } from "node:crypto";

import {
  approximateSmsSegments,
  isUnicodeSms,
} from "@/lib/notifications/sms-segments";
import type {
  NotificationProvider,
  ProviderDispatchResult,
  SendPayload,
} from "@/lib/notifications/types";

const ENDPOINT =
  "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/";

const TIMEOUT_MS = 15_000;

/**
 * The response codes worth naming. eSMS returns a bare number, and staring at
 * `CodeResult: 146` in a log row at 3am tells nobody anything.
 */
const CODE_REASONS: Record<string, string> = {
  "99": "invalid request — check the payload against the eSMS spec",
  "101": "authorization failed — ESMS_API_KEY / ESMS_SECRET_KEY rejected",
  "104": "brandname does not exist or is inactive",
  "124": "RequestId already used — duplicate of a send within the last 24h",
  "146": "CSKH template not registered with eSMS for this brandname",
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set — required for SMS_PROVIDER=esms. ` +
        "Set SMS_PROVIDER=mock to fall back to the console provider.",
    );
  }
  return value;
}

/**
 * Stored phone numbers are free-form (`+84 90 188 8484`, `090-188-8484`,
 * `0901888484` all pass the validator regex), while eSMS wants digits only.
 * Vietnamese local numbers never begin with 84, so a leading 84 is always the
 * country code.
 */
export function toEsmsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("84")) return `0${digits.slice(2)}`;
  if (digits.startsWith("0")) return digits;
  return `0${digits}`;
}

/**
 * Sandbox sends are validated by eSMS but never delivered or charged, so it
 * is the safe default everywhere except production. Set `ESMS_SANDBOX=0` to
 * send for real from a dev machine, or `=1` to keep production quiet.
 */
function sandboxFlag(): "0" | "1" {
  const raw = process.env.ESMS_SANDBOX?.trim();
  if (raw === "0" || raw === "1") return raw;
  return process.env.NODE_ENV === "production" ? "0" : "1";
}

/**
 * eSMS drops a repeat of the same RequestId inside 24h. Deriving it from the
 * rendered message means an accidental double-run of a cron job cannot bill
 * the customer's phone twice, while a genuine resend (a new password, a new
 * visit time) carries different text and goes through.
 */
function requestId(phone: string, templateCode: string, body: string): string {
  return createHash("sha1")
    .update(`${templateCode}|${phone}|${body}`)
    .digest("hex");
}

interface ESmsResponse {
  CodeResult?: string;
  SMSID?: string;
  ErrorMessage?: string;
}

export class ESmsProvider implements NotificationProvider {
  public readonly name = "esms";

  async send(payload: SendPayload): Promise<ProviderDispatchResult> {
    if (payload.channel !== "SMS") {
      throw new Error(
        `ESmsProvider received a ${payload.channel} payload; it only sends SMS`,
      );
    }

    const phone = toEsmsPhone(payload.to);
    const sandbox = sandboxFlag();
    const request = {
      ApiKey: requireEnv("ESMS_API_KEY"),
      SecretKey: requireEnv("ESMS_SECRET_KEY"),
      Brandname: requireEnv("ESMS_BRAND_NAME"),
      SmsType: "2",
      Phone: phone,
      Content: payload.body,
      IsUnicode: isUnicodeSms(payload.body) ? "1" : "0",
      Sandbox: sandbox,
      RequestId: requestId(phone, payload.templateCode, payload.body),
      campaignid: payload.templateCode,
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`eSMS HTTP ${res.status} ${res.statusText ?? ""}`.trim());
    }

    const json = (await res.json()) as ESmsResponse;
    if (json.CodeResult !== "100") {
      const code = json.CodeResult ?? "unknown";
      const reason = CODE_REASONS[code] ?? "see eSMS response code reference";
      const detail = json.ErrorMessage ? ` — ${json.ErrorMessage}` : "";
      throw new Error(`eSMS CodeResult ${code}: ${reason}${detail}`);
    }

    return {
      providerMessageId: json.SMSID ?? "",
      segmentsUsed: approximateSmsSegments(payload.body),
      // CodeResult 100 only means eSMS accepted the message. Carrier delivery
      // is reported through CallbackUrl, which we do not consume yet.
      dryRun: sandbox === "1",
    };
  }
}
