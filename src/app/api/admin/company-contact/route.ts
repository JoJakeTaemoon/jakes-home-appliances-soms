/**
 * GET  /api/admin/company-contact  → current HQ phone + default
 * PUT  /api/admin/company-contact  → upsert HQ phone
 *
 * ADMIN only. Writes a SystemSetting row keyed `company.hqPhone`. The value is
 * the single source of truth for the mobile "Call HQ" action and every
 * {hq_phone} notification placeholder (injected in sendNotification).
 *
 * GET uses `defineQuery`; PUT keeps the manual shape for the AuditLog
 * before/after pair (mirrors the scheduler-weights route).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";
import {
  COMPANY_HQ_PHONE_DEFAULT,
  getHqPhone,
  setHqPhone,
} from "@/lib/settings";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  // Display format is free-form (local "028-..." or intl "+84-..."); keep it to
  // dialable characters and a sane length.
  hqPhone: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(/^[0-9+().\-\s]+$/, "Phone may only contain digits, spaces, and + ( ) - ."),
});

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "ADMIN") throw new ForbiddenError("Insufficient role");
  },
  handler: async () => ({
    current: { hqPhone: await getHqPhone() },
    defaults: { hqPhone: COMPANY_HQ_PHONE_DEFAULT },
  }),
});

export async function PUT(request: NextRequest) {
  try {
    const caller = await requireRole(request, "ADMIN");
    const parsed = schema.parse(await request.json());
    const before = await getHqPhone();
    await setHqPhone(parsed.hqPhone, caller.userId);
    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "COMPANY_HQ_PHONE_UPDATE",
      entityType: "SystemSetting",
      entityId: "company.hqPhone",
      before: { hqPhone: before },
      after: { hqPhone: parsed.hqPhone },
      request,
    });
    return successResponse({ current: { hqPhone: parsed.hqPhone } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
