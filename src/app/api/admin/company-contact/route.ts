/**
 * GET  /api/admin/company-contact  → HQ phone + tax info (current + defaults)
 * PUT  /api/admin/company-contact  → upsert HQ phone
 * PATCH /api/admin/company-contact → upsert tax info (legal block)
 *
 * ADMIN + MANAGER. Writes SystemSetting rows keyed `company.hqPhone` and
 * `company.taxInfo`. PUT keeps a single-field payload for backward compat;
 * PATCH handles the new tax-info block (legalName / address /
 * representativeName / taxCode).
 *
 * `getHqPhone()` is the source of truth for the {hq_phone} notification
 * placeholder + the technician "Call HQ" action. `getCompanyTaxInfo()` is
 * the source of truth for contract PDFs and any document showing the
 * issuing company's legal block.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";
import {
  COMPANY_HQ_PHONE_DEFAULT,
  COMPANY_TAX_INFO_DEFAULT,
  getCompanyTaxInfo,
  getHqPhone,
  setCompanyTaxInfo,
  setHqPhone,
} from "@/lib/settings";
import { logAudit } from "@/lib/audit";

const phoneSchema = z.object({
  hqPhone: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(/^[0-9+().\-\s]+$/, "Phone may only contain digits, spaces, and + ( ) - ."),
});

const taxInfoSchema = z.object({
  legalName: z.string().trim().min(1).max(500),
  address: z.string().trim().min(1).max(500),
  representativeName: z.string().trim().min(1).max(200),
  taxCode: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .regex(/^[0-9-]+$/, "Tax code may only contain digits and dashes."),
});

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER")
      throw new ForbiddenError("Insufficient role");
  },
  handler: async () => {
    const [hqPhone, taxInfo] = await Promise.all([
      getHqPhone(),
      getCompanyTaxInfo(),
    ]);
    return {
      current: { hqPhone, taxInfo },
      defaults: {
        hqPhone: COMPANY_HQ_PHONE_DEFAULT,
        taxInfo: COMPANY_TAX_INFO_DEFAULT,
      },
    };
  },
});

export async function PUT(request: NextRequest) {
  try {
    const caller = await requireRole(request, ["ADMIN", "MANAGER"]);
    const parsed = phoneSchema.parse(await request.json());
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

export async function PATCH(request: NextRequest) {
  try {
    const caller = await requireRole(request, ["ADMIN", "MANAGER"]);
    const parsed = taxInfoSchema.parse(await request.json());
    const before = await getCompanyTaxInfo();
    await setCompanyTaxInfo(parsed, caller.userId);
    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "COMPANY_TAX_INFO_UPDATE",
      entityType: "SystemSetting",
      entityId: "company.taxInfo",
      before,
      after: parsed,
      request,
    });
    return successResponse({ current: { taxInfo: parsed } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
