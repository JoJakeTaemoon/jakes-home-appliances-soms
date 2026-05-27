/**
 * POST /api/tax-invoices/[id]/reissue — UC-TI-04. MANAGER+.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canIssueTaxInvoice } from "@/lib/payments/access";
import { reissueTaxInvoice } from "@/lib/tax-invoices/operations";
import { reissueTaxInvoiceSchema } from "@/lib/validators/taxInvoice";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canIssueTaxInvoice(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can reissue tax invoices");
    }
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    const parsed = reissueTaxInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid payload");
    }
    const result = await reissueTaxInvoice({
      taxInvoiceId: id,
      reason: parsed.data.reason,
      actorUserId: auth.userId,
    });
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
