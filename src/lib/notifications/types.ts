/**
 * Notification subsystem — public types.
 *
 * Phase 3.5 introduces a provider factory so the application code never
 * touches eSMS / Resend / SMTP directly. All call sites go through
 * `sendNotification()` which routes to the channel(s) chosen by
 * `src/lib/notifications/router.ts` and then dispatches to a provider
 * obtained from `getNotificationProvider()`.
 *
 * `NotificationChannel` and `NotificationStatus` are kept in sync with the
 * Prisma enums of the same name (`prisma/schema.prisma`). The runtime values
 * here are the string literals Prisma generates so we can pass them straight
 * to `prisma.notificationLog.create({ data: { channel, status } })`.
 */

import type { Locale } from "@/generated/prisma/client";

export type NotificationChannel = "SMS" | "EMAIL";

export type NotificationStatus =
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "MOCKED"
  | "SKIPPED";

export type NotificationLocale = Locale; // "ko" | "vi" | "en"

/**
 * Category drives opt-out behaviour:
 *   - SYSTEM        : security / credentials / receipts; opt-out ignored
 *   - TRANSACTIONAL : visit reminders, SR decisions, payment receipts
 *   - MARKETING     : promotional (none yet; placeholder for Phase 8+)
 */
export type NotificationCategory =
  | "SYSTEM"
  | "TRANSACTIONAL"
  | "MARKETING";

/** Variables substituted into template bodies — values must be strings. */
export type TemplateVars = Record<string, string>;

/** Payload accepted by a `NotificationProvider`. */
export interface SendPayload {
  channel: NotificationChannel;
  to: string;
  templateCode: string;
  locale: NotificationLocale;
  /** Pre-rendered body (already interpolated). */
  body: string;
  /** Pre-rendered subject (email only). */
  subject?: string;
  /** Echoed back through to the log row so providers can stash metadata. */
  contactId?: string | null;
  customerId?: string | null;
  vars?: TemplateVars;
}

/** Result of a single provider `send()`. */
export interface SendResult {
  /** NotificationLog row id (always created — even on FAIL/SKIPPED). */
  notificationLogId: string;
  status: NotificationStatus;
  providerMessageId?: string;
  segmentsUsed?: number;
  errorMessage?: string;
}

/** Provider contract. Implementations live alongside this file. */
export interface NotificationProvider {
  readonly name: string;
  send(payload: SendPayload): Promise<SendResult>;
}

export type ChannelRouting = {
  channel: NotificationChannel;
  /** Recipient string — phone for SMS, email for EMAIL. */
  recipient: string;
  /** True when this channel was the fallback (e.g. SMS-only template → EMAIL). */
  fallback?: boolean;
};
