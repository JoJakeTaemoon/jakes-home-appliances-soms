/**
 * POST /api/tax-invoices/[id]/email — re-email the tax invoice to the
 * contract party. MANAGER+.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { canIssueTaxInvoice } from "@/lib/payments/access";
import { resendTaxInvoiceEmail } from "@/lib/tax-invoices/operations";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canIssueTaxInvoice(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can resend tax invoices");
    }
  },
  params: paramsSchema,
  handler: ({ auth, params }) =>
    resendTaxInvoiceEmail({
      taxInvoiceId: params.id,
      actorUserId: auth.userId,
    }),
});
