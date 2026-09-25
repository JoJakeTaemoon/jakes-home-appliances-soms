/**
 * Channel router — picks which channel(s) deliver a template for a contact.
 *
 * Implements the rules in `docs/DOCUMENT_TEMPLATES.md` §C plus the Phase 3.5
 * channel-selection note in `.claude/CLAUDE.md`:
 *
 *   1. Start from the template's intrinsic `channels` list.
 *   2. Drop channels the contact doesn't have a recipient for
 *      (phone for SMS, email for EMAIL).
 *   3. Drop channels the contact has opted out of — UNLESS the template's
 *      `category` is `SYSTEM` (receipt, contract copy, tax invoice, portal
 *      welcome).
 *   4. If nothing is left and a fallback channel is intrinsically available
 *      AND the contact has the recipient for it AND opt-out allows it,
 *      add it as a fallback. (Used e.g. when an SMS-only template fires for
 *      a contact with no phone but with email.) No template carries a
 *      credential any more, so no template is excluded from fallback.
 *   5. If still nothing, return `[]` so the caller can log an admin error.
 *
 * Returns one routing entry per chosen channel — `sendNotification()` loops
 * over them and dispatches a separate `NotificationLog` row per entry.
 */

import type {
  ChannelRouting,
  NotificationChannel,
  NotificationCategory,
} from "@/lib/notifications/types";
import { getTemplate, type TemplateDef } from "@/lib/notifications/templates";

/** Shape required from a CustomerContact for routing (subset of the model). */
export interface RoutableContact {
  phone1: string;
  email: string | null;
  smsOptOut: boolean;
  emailOptOut: boolean;
}

function isOptedOut(
  category: NotificationCategory,
  channel: NotificationChannel,
  contact: RoutableContact,
): boolean {
  if (category === "SYSTEM") return false;
  if (channel === "SMS" && contact.smsOptOut) return true;
  if (channel === "EMAIL" && contact.emailOptOut) return true;
  return false;
}

function recipientFor(
  channel: NotificationChannel,
  contact: RoutableContact,
): string | null {
  if (channel === "SMS") return contact.phone1 || null;
  if (channel === "EMAIL") return contact.email || null;
  return null;
}

export function route({
  templateCode,
  contact,
}: {
  templateCode: string;
  contact: RoutableContact;
}): ChannelRouting[] {
  const tmpl: TemplateDef = getTemplate(templateCode);
  const out: ChannelRouting[] = [];

  // 1-3. Try the template's intrinsic channels.
  for (const ch of tmpl.channels) {
    const recipient = recipientFor(ch, contact);
    if (!recipient) continue;
    if (isOptedOut(tmpl.category, ch, contact)) continue;
    out.push({ channel: ch, recipient });
  }

  if (out.length > 0) return out;

  // 4. Cross-channel fallback (skipped for high-security templates).
  const tried = new Set(tmpl.channels);
  const fallbackOrder: NotificationChannel[] = ["EMAIL", "SMS"];
  for (const ch of fallbackOrder) {
    if (tried.has(ch)) continue;
    const recipient = recipientFor(ch, contact);
    if (!recipient) continue;
    if (isOptedOut(tmpl.category, ch, contact)) continue;
    out.push({ channel: ch, recipient, fallback: true });
    return out; // stop at first fallback hit
  }

  return out;
}
