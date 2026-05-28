/**
 * High-level notification entry point — the only orchestrator that writes
 * `NotificationLog` rows.
 *
 * Flow:
 *
 *   1. Resolve the recipient(s) from CustomerContact (or accept an inline
 *      override for one-off sends, e.g. portal welcome before the contact's
 *      portalEnabled flip lands).
 *   2. Compute the locale (override > contact.language > "vi").
 *   3. Route to the channel(s) per template + opt-out flags + fallback chain.
 *   4. Render the body (and subject for email).
 *   5. Dispatch through the provider factory — the provider returns
 *      `ProviderDispatchResult` (id + segments + dryRun) but never touches
 *      the DB.
 *   6. The orchestrator writes ONE `NotificationLog` row per attempt with the
 *      final status (SENT / MOCKED / FAILED), provider id + segments, and
 *      records an AuditLog row tagged `NOTIFICATION_SENT` /
 *      `NOTIFICATION_FAILED` / `NOTIFICATION_SKIPPED`.
 *   7. When routing yields nothing — write a SKIPPED row so audit/support can
 *      see the dropped delivery, and emit an admin warning.
 *
 * Phase 3.5 deepening: previously the mock adapter wrote its own log row,
 * which meant future eSMS / Resend adapters would have to duplicate the same
 * code (and diverge). Now the adapter contract narrows to pure dispatch and
 * audit lives in one place.
 *
 * Returns the array of `SendResult` for each delivery attempt — caller can
 * surface IDs to the UI or assert in tests.
 */

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getNotificationProvider } from "@/lib/notifications";
import { route, type RoutableContact } from "@/lib/notifications/router";
import {
  getTemplate,
  pickLocaleBody,
  pickLocaleSubject,
  renderTemplate,
} from "@/lib/notifications/templates";
import { getOverride } from "@/lib/notifications/template-overrides";
import { getHqPhone } from "@/lib/settings";
import type {
  NotificationChannel,
  NotificationLocale,
  NotificationStatus,
  SendResult,
  TemplateVars,
} from "@/lib/notifications/types";

export interface SendNotificationInput {
  templateCode: string;
  /** Either supply contactId so we read CustomerContact, OR supply contact + customerId inline. */
  customerContactId?: string;
  contactOverride?: {
    customerId: string | null;
    contactId: string | null;
    phone1: string;
    email: string | null;
    smsOptOut?: boolean;
    emailOptOut?: boolean;
    language?: NotificationLocale;
  };
  vars?: TemplateVars;
  /** Locale override; otherwise comes from the contact's `language`. */
  locale?: NotificationLocale;
  /** Pass-through for AuditLog (when the call originates from a staff action). */
  actorId?: string | null;
  actorType?: "USER" | "CUSTOMER" | "SYSTEM";
}

interface ResolvedContact extends RoutableContact {
  customerId: string | null;
  contactId: string | null;
  language: NotificationLocale;
}

async function resolveContact(
  input: SendNotificationInput,
): Promise<ResolvedContact | null> {
  if (input.contactOverride) {
    const o = input.contactOverride;
    return {
      customerId: o.customerId,
      contactId: o.contactId,
      phone1: o.phone1,
      email: o.email,
      smsOptOut: o.smsOptOut ?? false,
      emailOptOut: o.emailOptOut ?? false,
      language: o.language ?? "vi",
    };
  }
  if (!input.customerContactId) return null;

  const c = await prisma.customerContact.findUnique({
    where: { id: input.customerContactId },
    select: {
      id: true,
      customerId: true,
      phone1: true,
      email: true,
      smsOptOut: true,
      emailOptOut: true,
      language: true,
    },
  });
  if (!c) return null;
  return {
    customerId: c.customerId,
    contactId: c.id,
    phone1: c.phone1,
    email: c.email,
    smsOptOut: c.smsOptOut,
    emailOptOut: c.emailOptOut,
    language: c.language as NotificationLocale,
  };
}

/**
 * Write a `NotificationLog` row + record an AuditLog entry. Single point
 * where status/provider metadata land on disk — every dispatch path
 * (success / failure / skipped) funnels through here.
 */
async function recordLog(args: {
  contact: ResolvedContact;
  channel: NotificationChannel;
  recipient: string;
  templateCode: string;
  locale: NotificationLocale;
  providerName: string;
  status: NotificationStatus;
  providerMessageId?: string;
  segmentsUsed?: number;
  errorMessage?: string;
  payload: Record<string, unknown>;
  actorType: "USER" | "CUSTOMER" | "SYSTEM";
  actorId: string | null;
  auditAction: "NOTIFICATION_SENT" | "NOTIFICATION_FAILED" | "NOTIFICATION_SKIPPED";
  auditAfter: Record<string, unknown>;
}): Promise<string> {
  const log = await prisma.notificationLog.create({
    data: {
      customerId: args.contact.customerId,
      contactId: args.contact.contactId,
      templateCode: args.templateCode,
      channel: args.channel,
      locale: args.locale,
      provider: args.providerName,
      recipient: args.recipient,
      status: args.status,
      providerMessageId: args.providerMessageId,
      segmentsUsed: args.segmentsUsed,
      errorMessage: args.errorMessage,
      payload: args.payload as never,
      sentAt:
        args.status === "SENT" || args.status === "MOCKED" ? new Date() : null,
    },
    select: { id: true },
  });
  await logAudit({
    actorType: args.actorType,
    actorId: args.actorId,
    action: args.auditAction,
    entityType: "NotificationLog",
    entityId: log.id,
    after: args.auditAfter,
  });
  return log.id;
}

export async function sendNotification(
  input: SendNotificationInput,
): Promise<SendResult[]> {
  const tmpl = getTemplate(input.templateCode);
  const contact = await resolveContact(input);

  if (!contact) {
    console.error(
      `[notifications] sendNotification: no contact resolved for ${input.templateCode}`,
    );
    return [];
  }

  const locale: NotificationLocale = input.locale ?? contact.language;
  const routing = route({ templateCode: input.templateCode, contact });
  const actorType = input.actorType ?? "SYSTEM";
  const actorId = input.actorId ?? null;

  if (routing.length === 0) {
    // Skipped delivery — record + audit + admin error log.
    console.error(
      `[notifications] No deliverable channel for ${input.templateCode} → contact ${contact.contactId} (smsOptOut=${contact.smsOptOut}, emailOptOut=${contact.emailOptOut}, phone=${!!contact.phone1}, email=${!!contact.email})`,
    );
    const logId = await recordLog({
      contact,
      channel: tmpl.channels[0],
      recipient: contact.phone1 ?? contact.email ?? "unknown",
      templateCode: input.templateCode,
      locale,
      providerName: "router",
      status: "SKIPPED",
      errorMessage:
        "No deliverable channel (opted out / missing contact info)",
      payload: { reason: "no-deliverable-channel", vars: input.vars ?? {} },
      actorType,
      actorId,
      auditAction: "NOTIFICATION_SKIPPED",
      auditAfter: {
        templateCode: input.templateCode,
        contactId: contact.contactId,
      },
    });
    return [{ notificationLogId: logId, status: "SKIPPED" }];
  }

  const results: SendResult[] = [];
  // Allow admin DB overrides (UC-AD-04) to replace the file-based body/subject.
  const override = await getOverride(input.templateCode, locale);

  // `hq_phone` is always the company HQ number, never caller-specific, so it is
  // sourced from the admin-editable setting and overrides any value a caller
  // happened to pass. Changing it in settings updates every template at once.
  const vars: TemplateVars = { ...input.vars, hq_phone: await getHqPhone() };

  for (const r of routing) {
    const baseBody = override?.body ?? pickLocaleBody(tmpl, locale);
    const body = renderTemplate(baseBody, vars);
    const subjectRaw = override?.subject ?? pickLocaleSubject(tmpl, locale);
    const subject = subjectRaw
      ? renderTemplate(subjectRaw, vars)
      : undefined;

    const provider = getNotificationProvider(r.channel);
    try {
      const dispatch = await provider.send({
        channel: r.channel,
        to: r.recipient,
        templateCode: input.templateCode,
        locale,
        body,
        subject,
        contactId: contact.contactId,
        customerId: contact.customerId,
        vars,
      });
      const status: NotificationStatus = dispatch.dryRun ? "MOCKED" : "SENT";
      const logId = await recordLog({
        contact,
        channel: r.channel,
        recipient: r.recipient,
        templateCode: input.templateCode,
        locale,
        providerName: provider.name,
        status,
        providerMessageId: dispatch.providerMessageId,
        segmentsUsed: dispatch.segmentsUsed,
        payload: {
          subject: subject ?? null,
          body,
          vars: input.vars ?? {},
        },
        actorType,
        actorId,
        auditAction: "NOTIFICATION_SENT",
        auditAfter: {
          templateCode: input.templateCode,
          channel: r.channel,
          locale,
          recipient: r.recipient,
          status,
          providerMessageId: dispatch.providerMessageId ?? null,
          fallback: r.fallback ?? false,
        },
      });
      results.push({
        notificationLogId: logId,
        status,
        providerMessageId: dispatch.providerMessageId,
        segmentsUsed: dispatch.segmentsUsed,
      });
    } catch (err) {
      // Provider blew up — record FAILED row so we have a forensic trail.
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[notifications] Provider ${provider.name} failed for ${input.templateCode}: ${errMsg}`,
      );
      const logId = await recordLog({
        contact,
        channel: r.channel,
        recipient: r.recipient,
        templateCode: input.templateCode,
        locale,
        providerName: provider.name,
        status: "FAILED",
        errorMessage: errMsg,
        payload: { subject, body, vars: input.vars ?? {} },
        actorType,
        actorId,
        auditAction: "NOTIFICATION_FAILED",
        auditAfter: {
          templateCode: input.templateCode,
          channel: r.channel,
          error: errMsg,
        },
      });
      results.push({
        notificationLogId: logId,
        status: "FAILED",
        errorMessage: errMsg,
      });
    }
  }
  return results;
}
