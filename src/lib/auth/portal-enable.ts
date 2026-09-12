/**
 * Helpers for provisioning portal accounts.
 *
 *   - `enablePortalAccount`  : called when a CustomerContact flips to
 *     `portalEnabled=true`. Generates a 10-char random password, hashes it,
 *     marks the contact as needing first-login change, then dispatches
 *     SMS_PORTAL_WELCOME (always) + EMAIL_PORTAL_WELCOME (if email is set).
 *     Returns `{ plainPassword }` so caller can log / show in admin UI if
 *     needed (also still delivered via SMS for the customer).
 *
 *   - `resetPortalPassword` : MANAGER+ initiated. Same shape, sends
 *     SMS_PASSWORD_RESET (system message, ignores opt-out).
 *
 * Both helpers throw if the contact has no `phone1` (SMS is the canonical
 * delivery channel for credentials — see CLAUDE.md "channel rule").
 */

import prisma from "@/lib/prisma";
import {
  generateRandomPassword,
  hashPassword,
} from "@/lib/auth/password";
import { sendNotification } from "@/lib/notifications/send";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import type { NotificationLocale } from "@/lib/notifications/types";
import { HQ_PHONE } from "@/lib/config/company";

const PORTAL_URL = "portal.jakeshomeappliances.com.vn";

interface PortalEnableResult {
  contactId: string;
  plainPassword: string;
}

/**
 * Provision a brand-new portal account for an existing CustomerContact.
 *
 * Idempotent in the sense that calling on a contact that already has
 * `portalEnabled=true` will simply re-issue credentials (new password +
 * mustChangePassword reset). This matches how the office reset-password
 * endpoint should behave.
 */
export async function enablePortalAccount(opts: {
  contactId: string;
  actorId?: string | null;
  actorType?: "USER" | "SYSTEM";
}): Promise<PortalEnableResult> {
  const c = await prisma.customerContact.findUnique({
    where: { id: opts.contactId },
    select: {
      id: true,
      customerId: true,
      name: true,
      phone1: true,
      email: true,
      language: true,
      smsOptOut: true,
      emailOptOut: true,
    },
  });
  if (!c) throw new ValidationError("Contact not found");
  if (!c.phone1) {
    throw new ValidationError(
      "Cannot enable portal — contact has no phone1 (required for SMS credential delivery)",
    );
  }

  const password = generateRandomPassword(10);
  const hash = await hashPassword(password);

  await prisma.customerContact.update({
    where: { id: c.id },
    data: {
      portalEnabled: true,
      passwordHash: hash,
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  const locale = c.language as NotificationLocale;

  // Always send the welcome SMS.
  await sendNotification({
    templateCode: "SMS_PORTAL_WELCOME",
    contactOverride: {
      customerId: c.customerId,
      contactId: c.id,
      phone1: c.phone1,
      email: c.email,
      smsOptOut: c.smsOptOut,
      emailOptOut: c.emailOptOut,
      language: locale,
    },
    vars: {
      name: c.name,
      phone: c.phone1,
      pwd: password,
      url: PORTAL_URL,
    },
    actorType: opts.actorType ?? "USER",
    actorId: opts.actorId ?? null,
  });

  // Companion long-form email when email is present (hybrid per matrix).
  // EMAIL_PORTAL_WELCOME does NOT include the password (SMS-only for
  // credential — the email just confirms account activation).
  if (c.email) {
    await sendNotification({
      templateCode: "EMAIL_PORTAL_WELCOME",
      contactOverride: {
        customerId: c.customerId,
        contactId: c.id,
        phone1: c.phone1,
        email: c.email,
        smsOptOut: c.smsOptOut,
        emailOptOut: c.emailOptOut,
        language: locale,
      },
      vars: {
        name: c.name,
        phone: c.phone1,
        url: `https://${PORTAL_URL}`,
        hq_phone: HQ_PHONE,
      },
      actorType: opts.actorType ?? "USER",
      actorId: opts.actorId ?? null,
    });
  }

  await logAudit({
    actorType: opts.actorType ?? "USER",
    actorId: opts.actorId ?? null,
    action: "PORTAL_ENABLED",
    entityType: "CustomerContact",
    entityId: c.id,
    after: { portalEnabled: true },
  });

  return { contactId: c.id, plainPassword: password };
}

/**
 * Office-initiated password reset (UC-AU-06).
 *
 * Differs from the self-service flow:
 *   - Requires MANAGER+ (enforced by the caller)
 *   - No "name match" gate (the staff member already has the contact in their UI)
 *   - Always sends; never returns the generic "if exists" string
 */
export async function resetPortalPassword(opts: {
  contactId: string;
  actorId: string;
  actorType?: "USER" | "SYSTEM";
}): Promise<PortalEnableResult> {
  const c = await prisma.customerContact.findUnique({
    where: { id: opts.contactId },
    select: {
      id: true,
      customerId: true,
      name: true,
      phone1: true,
      email: true,
      language: true,
      portalEnabled: true,
      smsOptOut: true,
      emailOptOut: true,
    },
  });
  if (!c) throw new ValidationError("Contact not found");
  if (!c.portalEnabled) {
    throw new ValidationError("Contact does not have a portal account");
  }
  if (!c.phone1) {
    throw new ValidationError("Contact has no phone — cannot send reset SMS");
  }

  const password = generateRandomPassword(10);
  const hash = await hashPassword(password);

  await prisma.customerContact.update({
    where: { id: c.id },
    data: {
      passwordHash: hash,
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  // Revoke all sessions so the holder of an old token loses access.
  await prisma.customerSession.updateMany({
    where: { contactId: c.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await sendNotification({
    templateCode: "SMS_PASSWORD_RESET",
    contactOverride: {
      customerId: c.customerId,
      contactId: c.id,
      phone1: c.phone1,
      email: c.email,
      smsOptOut: c.smsOptOut,
      emailOptOut: c.emailOptOut,
      language: c.language as NotificationLocale,
    },
    vars: {
      name: c.name,
      pwd: password,
      url: PORTAL_URL,
      hq_phone: HQ_PHONE,
    },
    actorType: opts.actorType ?? "USER",
    actorId: opts.actorId,
  });

  await logAudit({
    actorType: opts.actorType ?? "USER",
    actorId: opts.actorId,
    action: "PORTAL_PASSWORD_RESET_BY_STAFF",
    entityType: "CustomerContact",
    entityId: c.id,
  });

  return { contactId: c.id, plainPassword: password };
}
