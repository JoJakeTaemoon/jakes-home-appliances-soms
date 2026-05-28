/**
 * PUT    /api/admin/notification-templates/:code?locale=vi
 *   body: { body: string, subject?: string }
 *   → upsert NotificationTemplate row + clear in-memory override cache
 *
 * DELETE /api/admin/notification-templates/:code?locale=vi
 *   → drop the override (revert to file default)
 *
 * Restricted to ADMIN.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { TEMPLATES } from "@/lib/notifications/templates";
import { clearOverrideCache } from "@/lib/notifications/template-overrides";
import { logAudit } from "@/lib/audit";
import type { Locale } from "@/generated/prisma/client";

const LOCALES = ["ko", "vi", "en"] as const;

const putSchema = z.object({
  body: z.string().min(1).max(20_000),
  subject: z.string().max(2_000).optional().nullable(),
});

function parseLocale(request: NextRequest): Locale {
  const url = new URL(request.url);
  const raw = url.searchParams.get("locale") ?? "vi";
  if (!LOCALES.includes(raw as (typeof LOCALES)[number])) {
    throw new ValidationError("Invalid locale");
  }
  return raw as Locale;
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const caller = await requireRole(request, "ADMIN");
    const { code } = await ctx.params;
    if (!TEMPLATES[code]) {
      throw new ValidationError("Unknown template code");
    }
    const locale = parseLocale(request);
    const parsed = putSchema.parse(await request.json());
    const def = TEMPLATES[code];
    const isEmail = def.channels.includes("EMAIL");
    const subject = isEmail ? (parsed.subject ?? null) : null;

    const before = await prisma.notificationTemplate.findUnique({
      where: { code_locale: { code, locale } },
      select: { body: true, subject: true },
    });

    const row = await prisma.notificationTemplate.upsert({
      where: { code_locale: { code, locale } },
      create: {
        code,
        locale,
        channel: def.channels[0],
        body: parsed.body,
        subject,
        updatedById: caller.userId,
      },
      update: {
        body: parsed.body,
        subject,
        updatedById: caller.userId,
      },
    });
    clearOverrideCache();
    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "NOTIFICATION_TEMPLATE_UPSERT",
      entityType: "NotificationTemplate",
      entityId: row.id,
      before: before ?? null,
      after: { code, locale, body: parsed.body, subject },
      request,
    });
    return successResponse({
      code: row.code,
      locale: row.locale,
      body: row.body,
      subject: row.subject,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const caller = await requireRole(request, "ADMIN");
    const { code } = await ctx.params;
    const locale = parseLocale(request);
    const before = await prisma.notificationTemplate.findUnique({
      where: { code_locale: { code, locale } },
      select: { id: true, body: true, subject: true },
    });
    if (before) {
      await prisma.notificationTemplate.delete({
        where: { code_locale: { code, locale } },
      });
      clearOverrideCache();
      await logAudit({
        actorType: "USER",
        actorId: caller.userId,
        action: "NOTIFICATION_TEMPLATE_DELETE",
        entityType: "NotificationTemplate",
        entityId: before.id,
        before: { body: before.body, subject: before.subject },
        after: null,
        request,
      });
    }
    return successResponse({ deleted: !!before });
  } catch (err) {
    return toErrorResponse(err);
  }
}
