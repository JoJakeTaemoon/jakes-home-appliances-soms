/**
 * Notification provider factory.
 *
 * Single point of truth for which provider implementation handles a given
 * channel. Configured via env:
 *
 *   SMS_PROVIDER=mock | esms
 *   EMAIL_PROVIDER=mock | resend
 *
 * Default for both is `mock`. Real providers throw when invoked (stubs) until
 * the F.4 (eSMS) and F.7 (Resend) credentials land — at which point we just
 * flip the env vars and ship; no code rewrite.
 *
 * Centralising the lookup also makes test injection easy: a single
 * `setNotificationProviderOverride()` helper lets tests swap in a fake without
 * monkeypatching imports.
 */

import { ESmsProvider } from "@/lib/notifications/esms-client";
import { MockNotificationProvider } from "@/lib/notifications/mock-client";
import { ResendProvider } from "@/lib/notifications/resend-client";
import type {
  NotificationChannel,
  NotificationProvider,
} from "@/lib/notifications/types";

let providerOverride: Partial<Record<NotificationChannel, NotificationProvider>> = {};

/**
 * Test-only hook — replace the provider for a single channel. Pass `null`
 * (or call `clearNotificationProviderOverride()`) to revert.
 */
export function setNotificationProviderOverride(
  channel: NotificationChannel,
  provider: NotificationProvider | null,
): void {
  if (provider === null) {
    delete providerOverride[channel];
  } else {
    providerOverride[channel] = provider;
  }
}

export function clearNotificationProviderOverrides(): void {
  providerOverride = {};
}

export function getNotificationProvider(
  channel: NotificationChannel,
): NotificationProvider {
  const override = providerOverride[channel];
  if (override) return override;

  const env =
    channel === "SMS" ? process.env.SMS_PROVIDER : process.env.EMAIL_PROVIDER;
  switch ((env ?? "mock").toLowerCase()) {
    case "mock":
      return new MockNotificationProvider();
    case "esms":
      if (channel !== "SMS") {
        // Misconfiguration — fall back to mock with a console warning rather
        // than blow up production at first send.
        console.warn(
          `[notifications] SMS_PROVIDER=esms requested for EMAIL channel; falling back to mock`,
        );
        return new MockNotificationProvider();
      }
      return new ESmsProvider();
    case "resend":
      if (channel !== "EMAIL") {
        console.warn(
          `[notifications] EMAIL_PROVIDER=resend requested for SMS channel; falling back to mock`,
        );
        return new MockNotificationProvider();
      }
      return new ResendProvider();
    default:
      console.warn(
        `[notifications] Unknown provider "${env}" for ${channel}; using mock`,
      );
      return new MockNotificationProvider();
  }
}

export type { NotificationProvider } from "@/lib/notifications/types";
