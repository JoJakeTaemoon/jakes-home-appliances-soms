/**
 * Resend email provider — STUB.
 *
 * Phase 3.5 is mock-first; the real provider lands when credentials arrive
 * (see Q F.7 in `docs/QUESTIONS.docx`). Resend is the chosen rail for
 * transactional email (portal welcome, payment receipts, visit completion);
 * vhost.vn Email Relay handles operational/marketing on a separate rail
 * (Q F.2 — also deferred).
 *
 * When credentials land:
 *   - Implement `send()` using the Resend SDK.
 *   - Map `SendResult.providerMessageId` from the Resend `id` field.
 *   - Set `process.env.EMAIL_PROVIDER=resend` to flip production traffic.
 *   - Add `RESEND_API_KEY` to the env.
 *
 * Until then, calling this provider will throw — `getNotificationProvider()`
 * defaults to `mock` and ignores unknown env values, so dev is unaffected.
 */

import type {
  NotificationProvider,
  SendPayload,
  SendResult,
} from "@/lib/notifications/types";

export class ResendProvider implements NotificationProvider {
  public readonly name = "resend";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_payload: SendPayload): Promise<SendResult> {
    throw new Error(
      "ResendProvider not implemented yet — credentials pending (Q F.7). " +
        "Set EMAIL_PROVIDER=mock or omit it to use the mock provider.",
    );
  }
}
