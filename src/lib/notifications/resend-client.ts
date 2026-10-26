/**
 * Resend email provider (transactional rail, Q F.7).
 *
 * Plain `fetch` against `POST https://api.resend.com/emails` — no SDK, the
 * call is one request. Env:
 *   - `RESEND_API_KEY`  (required when `EMAIL_PROVIDER=resend`)
 *   - `EMAIL_FROM`      default `Jake's Home Appliances <noreply@jakeshomeappliances.com.vn>`
 *   - `EMAIL_REPLY_TO`  default `cs@jakeshomeappliances.com.vn`
 *
 * The sender domain needs DKIM/SPF/DMARC verified in Resend before a real
 * send succeeds; until then Resend answers 403 and the row logs FAILED.
 *
 * Pure dispatch per the `NotificationProvider` contract. Every failure is a
 * thrown Error with a readable message — the orchestrator in `send.ts` turns
 * it into a FAILED `NotificationLog` row, same as the eSMS adapter.
 *
 * Template bodies are plain text, so the mail goes out as `text` only.
 * ponytail: no attachments — `SendPayload` has no slot for them yet; add one
 * when the visit-completion / tax-invoice emails start carrying the PDF.
 */

import type {
  NotificationProvider,
  ProviderDispatchResult,
  SendPayload,
} from "@/lib/notifications/types";

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 15_000;
const DEFAULT_FROM = "Jake's Home Appliances <noreply@jakeshomeappliances.com.vn>";
const DEFAULT_REPLY_TO = "cs@jakeshomeappliances.com.vn";

interface ResendError {
  name?: string;
  message?: string;
}

export class ResendProvider implements NotificationProvider {
  public readonly name = "resend";

  async send(payload: SendPayload): Promise<ProviderDispatchResult> {
    if (payload.channel !== "EMAIL") {
      throw new Error(
        `ResendProvider received a ${payload.channel} payload; it only sends EMAIL`,
      );
    }
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is not set — required for EMAIL_PROVIDER=resend. " +
          "Set EMAIL_PROVIDER=mock to fall back to the console provider.",
      );
    }

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM,
          reply_to: process.env.EMAIL_REPLY_TO?.trim() || DEFAULT_REPLY_TO,
          to: [payload.to],
          subject: payload.subject,
          text: payload.body,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Resend request failed: ${msg}`);
    }

    const raw = await res.text();
    let json: (ResendError & { id?: string }) | null = null;
    try {
      json = JSON.parse(raw);
    } catch {
      // Gateways answer with HTML; the status line below is still useful.
    }

    if (!res.ok) {
      const kind = json?.name ? ` ${json.name}` : "";
      const detail = json?.message ?? res.statusText ?? "";
      const hint =
        res.status === 401 || res.status === 403
          ? " (check RESEND_API_KEY and the verified sender domain)"
          : "";
      throw new Error(
        `Resend HTTP ${res.status}${kind}: ${detail}${hint}`.trim(),
      );
    }

    return { providerMessageId: json?.id ?? "" };
  }
}
