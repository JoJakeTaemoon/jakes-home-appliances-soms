/**
 * POST /api/admin/notification-logs/send
 *
 * Send one of the registered SMS templates by hand. ADMIN + MANAGER only.
 *
 * Free text is deliberately not offered. eSMS refuses any body it has not
 * registered for the brandname (`CodeResult 146`), so a typed message cannot
 * reach a handset; staff instead pick a template and fill its variables, and
 * the send goes out on the exact wording the carrier approved.
 *
 * Recipients are either known `CustomerContact`s — each then receives the
 * template in their own language — or a single raw phone number for one-off
 * cases such as messaging a technician, which uses `locale` (default `vi`).
 * Contacts are sent one at a time so one refusal never hides the others.
 *
 * `hq_phone` is not accepted from the caller: `sendNotification()` always
 * substitutes the company number from settings.
 */

import { z } from "zod";

import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { sendNotification } from "@/lib/notifications/send";
import { TEMPLATES } from "@/lib/notifications/templates";
import type { NotificationLocale } from "@/lib/notifications/types";

/** One request fans out to at most this many contacts. */
const MAX_RECIPIENTS = 50;

/** Server-owned; a caller-supplied value would be overwritten anyway. */
const SERVER_FILLED = new Set(["hq_phone"]);

const bodySchema = z
  .object({
    templateCode: z.string().trim().min(1).max(60),
    vars: z.record(z.string(), z.string().max(200)).default({}),
    customerContactIds: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_RECIPIENTS)
      .optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    locale: z.enum(["ko", "vi", "en"]).optional(),
  })
  .refine((d) => !!d.customerContactIds !== !!d.phone, {
    message: "Provide exactly one of customerContactIds or phone",
    path: ["customerContactIds"],
  });

/** Every placeholder the template uses, across all three locales. */
function requiredVars(templateCode: string): string[] {
  const tmpl = TEMPLATES[templateCode];
  const found = new Set<string>();
  for (const body of Object.values(tmpl.bodies)) {
    for (const m of body.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
      if (!SERVER_FILLED.has(m[1])) found.add(m[1]);
    }
  }
  return [...found];
}

interface RecipientResult {
  contactId: string | null;
  recipient: string;
  status: string;
  notificationLogId: string | null;
  errorMessage: string | null;
}

export const POST = defineMutation({
  audience: "staff",
  body: bodySchema,
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
      throw new ForbiddenError("Insufficient role");
    }
  },
  handler: async ({ body, auth }) => {
    if (!TEMPLATES[body.templateCode]) {
      throw new NotFoundError(`Unknown template: ${body.templateCode}`);
    }
    if (!TEMPLATES[body.templateCode].channels.includes("SMS")) {
      throw new ValidationError("Only SMS templates can be sent from here");
    }

    // An unfilled placeholder would go out as the literal "{name}", so a
    // missing value is a hard error rather than a blank substitution.
    const missing = requiredVars(body.templateCode).filter(
      (v) => !body.vars[v]?.trim(),
    );
    if (missing.length > 0) {
      throw new ValidationError(
        `Missing template variables: ${missing.join(", ")}`,
      );
    }

    const results: RecipientResult[] = [];

    if (body.customerContactIds) {
      // De-duplicate: the picker can hand back the same contact twice when a
      // person appears under two customers in the search results.
      const ids = [...new Set(body.customerContactIds)];
      const contacts = await prisma.customerContact.findMany({
        where: { id: { in: ids } },
        select: { id: true, language: true, phone1: true },
      });
      if (contacts.length === 0) {
        throw new NotFoundError("No matching customer contact");
      }

      for (const contact of contacts) {
        const [result] = await sendNotification({
          templateCode: body.templateCode,
          customerContactId: contact.id,
          vars: body.vars,
          // No explicit locale: each contact reads their own language.
          locale: body.locale,
          actorId: auth.userId,
          actorType: "USER",
        });
        results.push({
          contactId: contact.id,
          recipient: contact.phone1,
          status: result?.status ?? "SKIPPED",
          notificationLogId: result?.notificationLogId ?? null,
          errorMessage: result?.errorMessage ?? null,
        });
      }
    } else {
      const locale: NotificationLocale = body.locale ?? "vi";
      const [result] = await sendNotification({
        templateCode: body.templateCode,
        contactOverride: {
          customerId: null,
          contactId: null,
          phone1: body.phone!,
          email: null,
          language: locale,
        },
        vars: body.vars,
        locale,
        actorId: auth.userId,
        actorType: "USER",
      });
      results.push({
        contactId: null,
        recipient: body.phone!,
        status: result?.status ?? "SKIPPED",
        notificationLogId: result?.notificationLogId ?? null,
        errorMessage: result?.errorMessage ?? null,
      });
    }

    const sent = results.filter(
      (r) => r.status === "SENT" || r.status === "MOCKED",
    ).length;
    return {
      results,
      sent,
      failed: results.length - sent,
      // First failure reason, so the UI has something to show without
      // walking the list itself.
      errorMessage: results.find((r) => r.errorMessage)?.errorMessage ?? null,
    };
  },
});
