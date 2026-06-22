/**
 * eSMS.vn Brandname provider — STUB.
 *
 * Phase 3.5 is mock-first; the real provider lands when credentials arrive:
 *   - Brandname `JakeApp` (CSKH / SmsType=2) — eSMS approval lead-time
 *     ~2-3 weeks (see Q F.4 in `docs/QUESTIONS.docx`).
 *   - REST endpoint: `https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/`
 *   - Verified pricing: 830 VND/segment + 50K VND/mo per-network maintenance
 *     across 4 networks (Vinaphone / Mobifone / Viettel / Vietnamobile).
 *
 * When the credentials land:
 *   - Move the request payload into `send()` below.
 *   - Map `SendResult.providerMessageId` from the eSMS `RefId` field.
 *   - Update `process.env.SMS_PROVIDER=esms` to flip production traffic.
 *
 * Until then, calling this provider will throw — `getNotificationProvider()`
 * defaults to `mock` and ignores unknown env values, so dev is unaffected.
 */

import type {
  NotificationProvider,
  ProviderDispatchResult,
  SendPayload,
} from "@/lib/notifications/types";

export class ESmsProvider implements NotificationProvider {
  public readonly name = "esms";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_payload: SendPayload): Promise<ProviderDispatchResult> {
    throw new Error(
      "ESmsProvider not implemented yet — credentials pending (Q F.4). " +
        "Set SMS_PROVIDER=mock or omit it to use the mock provider.",
    );
  }
}
