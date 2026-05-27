/**
 * POST /api/tax-invoices/[id]/email — re-email the tax invoice to the
 * contract party. MANAGER+.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";
import { canIssueTaxInvoice } from "@/lib/payments/access";
import { resendTaxInvoiceEmail } from "@/lib/tax-invoices/operations";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canIssueTaxInvoice(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can resend tax invoices");
    }
    const { id } = await ctx.params;
    const result = await resendTaxInvoiceEmail({
      taxInvoiceId: id,
      actorUserId: auth.userId,
    });
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
