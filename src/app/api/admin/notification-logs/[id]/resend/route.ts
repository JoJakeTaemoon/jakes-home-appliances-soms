/**
 * POST /api/admin/notification-logs/:id/resend
 *
 * Retry a delivery that failed. ADMIN + MANAGER only.
 *
 * The retry goes back through `sendNotification()` rather than re-posting the
 * stored body, which means it picks up whatever has been fixed since: a
 * corrected template, a newly registered eSMS body, a repaired phone number.
 * It writes its own NotificationLog row, so the original failure stays on the
 * record and the history shows both attempts.
 *
 * Only FAILED rows are retried. A SKIPPED row was never sent on purpose (the
 * contact opted out, or had no usable phone or email), and resending it would
 * walk straight past that decision.
 */

import { z } from "zod";

import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { sendNotification } from "@/lib/notifications/send";
import type { NotificationLocale, TemplateVars } from "@/lib/notifications/types";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export const POST = defineMutation({
  audience: "staff",
  params: paramsSchema,
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
      throw new ForbiddenError("Insufficient role");
    }
  },
  handler: async ({ params, auth }) => {
    const log = await prisma.notificationLog.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        templateCode: true,
        channel: true,
        locale: true,
        recipient: true,
        customerId: true,
        contactId: true,
        payload: true,
      },
    });
    if (!log) throw new NotFoundError("Notification log not found");
    if (log.status !== "FAILED") {
      throw new ValidationError(
        `Only FAILED deliveries can be resent (this one is ${log.status})`,
      );
    }

    const payload = (log.payload ?? {}) as Record<string, unknown>;
    const vars = (payload.vars ?? {}) as TemplateVars;
    const locale = log.locale as NotificationLocale;

    // Prefer the contact row so the send re-reads the current phone / email
    // and opt-out flags. Sends that never had one (a portal welcome issued
    // before the contact was enabled) are replayed against the recipient the
    // original attempt used.
    const results = await sendNotification(
      log.contactId
        ? {
            templateCode: log.templateCode,
            customerContactId: log.contactId,
            vars,
            locale,
            actorId: auth.userId,
            actorType: "USER",
          }
        : {
            templateCode: log.templateCode,
            contactOverride: {
              customerId: log.customerId,
              contactId: null,
              phone1: log.channel === "SMS" ? log.recipient : "",
              email: log.channel === "EMAIL" ? log.recipient : null,
              language: locale,
            },
            vars,
            locale,
            actorId: auth.userId,
            actorType: "USER",
          },
    );

    const result = results[0] ?? null;
    return {
      resentFrom: log.id,
      status: result?.status ?? "SKIPPED",
      notificationLogId: result?.notificationLogId ?? null,
      errorMessage: result?.errorMessage ?? null,
    };
  },
});
