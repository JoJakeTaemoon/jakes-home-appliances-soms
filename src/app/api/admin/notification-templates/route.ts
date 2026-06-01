/**
 * GET  /api/admin/notification-templates
 *   → list every (templateCode × locale) row with file default + DB override
 *
 * Restricted to ADMIN + MANAGER.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import {
  TEMPLATES,
  TEMPLATE_CODES,
  pickLocaleBody,
  pickLocaleSubject,
} from "@/lib/notifications/templates";
import { getTemplateDescription } from "@/lib/notifications/template-descriptions";
import type { Locale } from "@/generated/prisma/client";

const LOCALES: Locale[] = ["ko", "vi", "en"];

interface TemplateRow {
  code: string;
  channel: "SMS" | "EMAIL";
  locale: Locale;
  description: string;
  defaultBody: string;
  defaultSubject: string | null;
  overrideBody: string | null;
  overrideSubject: string | null;
  overrideUpdatedAt: string | null;
  enabled: boolean;
}

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER")
      throw new ForbiddenError("Insufficient role");
  },
  handler: async () => {
    const overrides = await prisma.notificationTemplate.findMany({
      select: {
        code: true,
        locale: true,
        body: true,
        subject: true,
        enabled: true,
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
          description: getTemplateDescription(code, locale),
          defaultBody: pickLocaleBody(def, locale),
          defaultSubject: pickLocaleSubject(def, locale) ?? null,
          overrideBody: o?.body ?? null,
          overrideSubject: o?.subject ?? null,
          overrideUpdatedAt: o?.updatedAt.toISOString() ?? null,
          enabled: o?.enabled ?? true,
        });
      }
    }
    return { rows };
  },
});
