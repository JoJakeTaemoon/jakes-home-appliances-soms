/**
 * Mock notification provider — default for dev/staging/test.
 *
 * Pure dispatcher per the `NotificationProvider` contract — the orchestrator
 * (`src/lib/notifications/send.ts`) owns the `NotificationLog` write. This
 * provider only:
 *
 *   - Pretty-prints a boxed message to `console.log` so flows are visible
 *     during smoke tests.
 *   - Approximates an SMS segment count for cost / GSM-7 audit accuracy.
 *   - Returns a synthetic provider message id (`mock-<uuid>`) + `dryRun: true`
 *     so the orchestrator records the log row with `status='MOCKED'`.
 *
 * The real eSMS / Resend providers will implement the same contract so the
 * orchestrator never branches on provider type — only on `dryRun`. See
 * CLAUDE.md "Notification providers (mock-first, Phase 3.5)".
 *
 * Production-safety guard kept in this file (not in the orchestrator) because
 * it is mock-specific behaviour — a misconfigured `SMS_PROVIDER=mock` in prod
 * must emit a loud warning, but only when the mock provider is actually
 * invoked. No template carries a credential any more (passwords are read out
 * over the phone, never sent), so there is nothing left to redact.
 */

import type {
  NotificationProvider,
  ProviderDispatchResult,
  SendPayload,
} from "@/lib/notifications/types";
import { publishMockDispatch } from "@/lib/notifications/mock-bus";
import { approximateSmsSegments } from "@/lib/notifications/sms-segments";

function tag(channel: SendPayload["channel"]): string {
  return channel === "SMS" ? "[MOCK SMS]" : "[MOCK EMAIL]";
}

function box(title: string, lines: string[]): string {
  const max = Math.max(title.length, ...lines.map((l) => l.length));
  const bar = "─".repeat(Math.min(80, max + 2));
  const inner = lines.map((l) => `│ ${l}`).join("\n");
  return [`┌${bar}┐`, `│ ${title}`, `├${bar}┤`, inner, `└${bar}┘`].join("\n");
}

export class MockNotificationProvider implements NotificationProvider {
  public readonly name = "mock";

  async send(payload: SendPayload): Promise<ProviderDispatchResult> {
    const messageId = `mock-${crypto.randomUUID()}`;
    const segmentsUsed =
      payload.channel === "SMS"
        ? approximateSmsSegments(payload.body)
        : undefined;

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
    const lines = [
      `to       : ${payload.to}`,
      `template : ${payload.templateCode} (${payload.locale})`,
    ];
    if (payload.subject) lines.push(`subject  : ${payload.subject}`);
    if (segmentsUsed) lines.push(`segments : ${segmentsUsed}`);
    lines.push(`message  : ${messageId}`);
    lines.push("");
    for (const ln of payload.body.split("\n")) lines.push(ln);

    console.log(`${tag(payload.channel)}\n${box("Mock dispatch", lines)}`);

    // Fan-out to the dev-only browser bus so mocked sends surface the
    // rendered body in the dev-tools console. Skipped in production so a
    // misconfigured mock provider doesn't stream message bodies to any SSE
    // listener.
    if (process.env.NODE_ENV !== "production") {
      publishMockDispatch({
        id: messageId,
        ts: Date.now(),
        channel: payload.channel,
        to: payload.to,
        templateCode: payload.templateCode,
        locale: payload.locale,
        subject: payload.subject,
        body: payload.body,
        segmentsUsed,
        messageId,
      });
    }

    return {
      providerMessageId: messageId,
      segmentsUsed,
      dryRun: true,
    };
  }
}
