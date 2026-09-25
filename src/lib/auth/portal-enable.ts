/**
 * Helpers for provisioning portal accounts.
 *
 *   - `enablePortalAccount`  : called when a CustomerContact flips to
 *     `portalEnabled=true`. Generates a 10-char random password, hashes it,
 *     marks the contact as needing first-login change, then dispatches
 *     EMAIL_PORTAL_WELCOME (if email is set) — an activation notice that
 *     carries no credential.
 *
 *   - `resetPortalPassword` : MANAGER+ initiated. Same shape, sends nothing.
 *
 * Both return `{ plainPassword }`: no password is ever transmitted (2026-09-25,
 * matching the staff reset of 2026-09-24), so the caller shows it on screen
 * once and the office reads it out over the phone. Nothing about a credential
 * reaches a delivery log.
 *
 * Both helpers throw if the contact has no `phone1` — it is the portal login
 * ID, not a delivery channel.
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
import { HQ_PHONE, PORTAL_URL } from "@/lib/config/company";

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
      "Cannot enable portal — contact has no phone1 (it is the login ID)",
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

  // Activation notice when an email is on file. EMAIL_PORTAL_WELCOME carries
  // no password — it names the login ID and says staff will read the
  // temporary password out by phone.
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
 * Office-initiated password reset (UC-AU-06). Requires MANAGER+, enforced by
 * the caller.
 *
 * Sends nothing. The new password comes back in `plainPassword` for the
 * screen to show once; staff read it out to the customer on the phone. That
 * keeps the credential out of every delivery log and off the customer's
 * handset, where an intercepted SMS would hand over the account.
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
    throw new ValidationError("Contact has no phone — cannot identify the login");
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

  await logAudit({
    actorType: opts.actorType ?? "USER",
    actorId: opts.actorId,
    action: "PORTAL_PASSWORD_RESET_BY_STAFF",
    entityType: "CustomerContact",
    entityId: c.id,
  });

  return { contactId: c.id, plainPassword: password };
}
