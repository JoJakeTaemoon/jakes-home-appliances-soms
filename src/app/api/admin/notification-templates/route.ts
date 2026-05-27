/**
 * GET  /api/admin/notification-templates
 *   → list every (templateCode × locale) row with file default + DB override
 *
 * Restricted to ADMIN.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  TEMPLATES,
  TEMPLATE_CODES,
  pickLocaleBody,
  pickLocaleSubject,
} from "@/lib/notifications/templates";
import type { Locale } from "@/generated/prisma/client";

const LOCALES: Locale[] = ["ko", "vi", "en"];

interface TemplateRow {
  code: string;
  channel: "SMS" | "EMAIL";
  locale: Locale;
  defaultBody: string;
  defaultSubject: string | null;
  overrideBody: string | null;
  overrideSubject: string | null;
  overrideUpdatedAt: string | null;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, "ADMIN");
    const overrides = await prisma.notificationTemplate.findMany({
      select: {
        code: true,
        locale: true,
        body: true,
        subject: true,
        updatedAt: true,
      },
    });
    const overrideMap = new Map<string, (typeof overrides)[number]>();
    for (const o of overrides) {
      overrideMap.set(`${o.code}::${o.locale}`, o);
    }
    const rows: TemplateRow[] = [];
    for (const code of TEMPLATE_CODES) {
      const def = TEMPLATES[code];
      for (const locale of LOCALES) {
        const o = overrideMap.get(`${code}::${locale}`);
        rows.push({
          code,
          channel: def.channels[0] as "SMS" | "EMAIL",
          locale,
          defaultBody: pickLocaleBody(def, locale),
          defaultSubject: pickLocaleSubject(def, locale) ?? null,
          overrideBody: o?.body ?? null,
          overrideSubject: o?.subject ?? null,
          overrideUpdatedAt: o?.updatedAt.toISOString() ?? null,
        });
      }
    }
    return successResponse({ rows });
  } catch (err) {
    return toErrorResponse(err);
  }
}
