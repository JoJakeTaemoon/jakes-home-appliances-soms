/**
 * POST /api/tax-invoices/[id]/reissue — UC-TI-04. MANAGER+.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { canIssueTaxInvoice } from "@/lib/payments/access";
import { reissueTaxInvoice } from "@/lib/tax-invoices/operations";
import { reissueTaxInvoiceSchema } from "@/lib/validators/taxInvoice";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canIssueTaxInvoice(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can reissue tax invoices");
    }
  },
  params: paramsSchema,
  body: reissueTaxInvoiceSchema,
  handler: ({ auth, body, params }) =>
    reissueTaxInvoice({
      taxInvoiceId: params.id,
      reason: body.reason,
      actorUserId: auth.userId,
    }),
});
