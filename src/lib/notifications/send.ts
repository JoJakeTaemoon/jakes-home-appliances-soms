/**
 * High-level notification entry point.
 *
 * Call sites use this — never the provider or the router directly. The flow:
 *
 *   1. Resolve the recipient(s) from CustomerContact (or accept an inline
 *      override for one-off sends, e.g. portal welcome before the contact's
 *      portalEnabled flip lands).
 *   2. Compute the locale (override > contact.language > "vi").
 *   3. Route to the channel(s) per template + opt-out flags + fallback chain.
 *   4. Render the body (and subject for email).
 *   5. Dispatch through the provider factory; each provider writes its own
 *      NotificationLog row.
 *   6. When routing yields nothing — write a SKIPPED NotificationLog row so
 *      audit/support can see the dropped delivery, and emit an admin warning.
 *   7. Record one AuditLog row tagged `NOTIFICATION_SENT` (or `_SKIPPED`).
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
import type {
  NotificationLocale,
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

  if (routing.length === 0) {
    // Skipped delivery — record + audit + admin error log.
    console.error(
      `[notifications] No deliverable channel for ${input.templateCode} → contact ${contact.contactId} (smsOptOut=${contact.smsOptOut}, emailOptOut=${contact.emailOptOut}, phone=${!!contact.phone1}, email=${!!contact.email})`,
    );
    const skipped = await prisma.notificationLog.create({
      data: {
        customerId: contact.customerId,
        contactId: contact.contactId,
        templateCode: input.templateCode,
        channel: tmpl.channels[0],
        locale,
        provider: "router",
        recipient: contact.phone1 ?? contact.email ?? "unknown",
        status: "SKIPPED",
        errorMessage: "No deliverable channel (opted out / missing contact info)",
        payload: { reason: "no-deliverable-channel", vars: input.vars ?? {} },
      },
      select: { id: true },
    });
    await logAudit({
      actorType: input.actorType ?? "SYSTEM",
      actorId: input.actorId ?? null,
      action: "NOTIFICATION_SKIPPED",
      entityType: "NotificationLog",
      entityId: skipped.id,
      after: { templateCode: input.templateCode, contactId: contact.contactId },
    });
    return [
      {
        notificationLogId: skipped.id,
        status: "SKIPPED",
      },
    ];
  }

  const results: SendResult[] = [];
  // Allow admin DB overrides (UC-AD-04) to replace the file-based body/subject.
  const override = await getOverride(input.templateCode, locale);
  for (const r of routing) {
    const baseBody = override?.body ?? pickLocaleBody(tmpl, locale);
    const body = renderTemplate(baseBody, input.vars ?? {});
    const subjectRaw = override?.subject ?? pickLocaleSubject(tmpl, locale);
    const subject = subjectRaw
      ? renderTemplate(subjectRaw, input.vars ?? {})
      : undefined;

    const provider = getNotificationProvider(r.channel);
    try {
      const result = await provider.send({
        channel: r.channel,
        to: r.recipient,
        templateCode: input.templateCode,
        locale,
        body,
        subject,
        contactId: contact.contactId,
        customerId: contact.customerId,
        vars: input.vars,
      });
      results.push(result);
      await logAudit({
        actorType: input.actorType ?? "SYSTEM",
        actorId: input.actorId ?? null,
        action: "NOTIFICATION_SENT",
        entityType: "NotificationLog",
        entityId: result.notificationLogId,
        after: {
          templateCode: input.templateCode,
          channel: r.channel,
          locale,
          recipient: r.recipient,
          status: result.status,
          providerMessageId: result.providerMessageId ?? null,
          fallback: r.fallback ?? false,
        },
      });
    } catch (err) {
      // Provider blew up — record FAILED row so we have a forensic trail.
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[notifications] Provider ${provider.name} failed for ${input.templateCode}: ${errMsg}`,
      );
      const failed = await prisma.notificationLog.create({
        data: {
          customerId: contact.customerId,
          contactId: contact.contactId,
          templateCode: input.templateCode,
          channel: r.channel,
          locale,
          provider: provider.name,
          recipient: r.recipient,
          status: "FAILED",
          errorMessage: errMsg,
          payload: { subject, body, vars: input.vars ?? {} },
        },
        select: { id: true },
      });
      results.push({
        notificationLogId: failed.id,
        status: "FAILED",
        errorMessage: errMsg,
      });
      await logAudit({
        actorType: input.actorType ?? "SYSTEM",
        actorId: input.actorId ?? null,
        action: "NOTIFICATION_FAILED",
        entityType: "NotificationLog",
        entityId: failed.id,
        after: {
          templateCode: input.templateCode,
          channel: r.channel,
          error: errMsg,
        },
      });
    }
  }
  return results;
}
