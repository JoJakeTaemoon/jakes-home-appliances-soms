/**
 * Mock notification provider — default for dev/staging/test.
 *
 * Behaviour:
 *   - Logs a pretty boxed message to `console.log` so flows are visible
 *     during smoke tests.
 *   - Writes a `NotificationLog` row with `provider='mock'` and
 *     `status='MOCKED'`.
 *   - Returns a synthetic provider message id (`mock-<uuid>`) for traceability.
 *
 * The real eSMS / Resend providers will return the same `SendResult` shape so
 * the call sites never need to change when production credentials arrive
 * (see CLAUDE.md "Notification providers (mock-first, Phase 3.5)").
 */

import prisma from "@/lib/prisma";
import type {
  NotificationProvider,
  SendPayload,
  SendResult,
} from "@/lib/notifications/types";

function tag(channel: SendPayload["channel"]): string {
  return channel === "SMS" ? "[MOCK SMS]" : "[MOCK EMAIL]";
}

function box(title: string, lines: string[]): string {
  const max = Math.max(title.length, ...lines.map((l) => l.length));
  const bar = "─".repeat(Math.min(80, max + 2));
  const inner = lines.map((l) => `│ ${l}`).join("\n");
  return [`┌${bar}┐`, `│ ${title}`, `├${bar}┤`, inner, `└${bar}┘`].join("\n");
}

/**
 * Approximate SMS segment count for log accuracy. GSM-7 = 160 chars/seg;
 * Unicode = 70 chars/seg. Switches based on whether the body contains any
 * non-ASCII character (a good-enough proxy for the GSM-7 set in dev).
 */
function approximateSmsSegments(body: string): number {
  const isUnicode = /[^\x00-\x7F]/.test(body);
  const limit = isUnicode ? 70 : 160;
  return Math.max(1, Math.ceil(body.length / limit));
}

/**
 * Templates whose body contains credentials. The mock provider redacts the
 * body in production logs so a misconfigured `SMS_PROVIDER=mock` in prod
 * doesn't leak passwords to terminal / log aggregator.
 */
const CREDENTIAL_TEMPLATES = new Set([
  "SMS_PORTAL_WELCOME",
  "SMS_PASSWORD_RESET",
]);

function shouldRedactBody(templateCode: string): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return CREDENTIAL_TEMPLATES.has(templateCode);
}

export class MockNotificationProvider implements NotificationProvider {
  public readonly name = "mock";

  async send(payload: SendPayload): Promise<SendResult> {
    const messageId = `mock-${crypto.randomUUID()}`;
    const segmentsUsed =
      payload.channel === "SMS" ? approximateSmsSegments(payload.body) : null;

    // Production safety: if the mock provider is somehow still active in
    // production (it should never be — `SMS_PROVIDER=mock` is dev-only),
    // emit a loud warning so the misconfiguration is visible.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[MOCK PROVIDER WARNING] Mock notification dispatched in production. " +
          "Set SMS_PROVIDER and EMAIL_PROVIDER to a real adapter (esms / resend).",
      );
    }

    // Pretty console output — easy to spot in dev terminals.
    const redactBody = shouldRedactBody(payload.templateCode);
    const lines = [
      `to       : ${payload.to}`,
      `template : ${payload.templateCode} (${payload.locale})`,
    ];
    if (payload.subject) lines.push(`subject  : ${payload.subject}`);
    if (segmentsUsed) lines.push(`segments : ${segmentsUsed}`);
    lines.push(`message  : ${messageId}`);
    lines.push("");
    if (redactBody) {
      lines.push("[body redacted — credential template in production]");
    } else {
      for (const ln of payload.body.split("\n")) lines.push(ln);
    }

    console.log(`${tag(payload.channel)}\n${box("Mock dispatch", lines)}`);

    const log = await prisma.notificationLog.create({
      data: {
        customerId: payload.customerId ?? null,
        contactId: payload.contactId ?? null,
        templateCode: payload.templateCode,
        channel: payload.channel,
        locale: payload.locale,
        provider: "mock",
        recipient: payload.to,
        payload: {
          subject: payload.subject ?? null,
          body: payload.body,
          vars: payload.vars ?? {},
        },
        status: "MOCKED",
        providerMessageId: messageId,
        segmentsUsed: segmentsUsed ?? undefined,
        sentAt: new Date(),
      },
      select: { id: true },
    });

    return {
      notificationLogId: log.id,
      status: "MOCKED",
      providerMessageId: messageId,
      segmentsUsed: segmentsUsed ?? undefined,
    };
  }
}
