/**
 * POST /api/payments/[id]/partial (UC-PY-03).
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { PaymentWorkflow } from "@/lib/payments/workflow";
import { applyPartialSchema } from "@/lib/validators/payment";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canApplyPartial(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  params: paramsSchema,
  body: applyPartialSchema,
  handler: async ({ auth, body, params }) => {
    try {
      return await PaymentWorkflow.applyPartial({
        paymentId: params.id,
        partialAmount: body.partialAmount,
        actorUserId: auth.userId,
      });
    } catch (err) {
      throw new ValidationError(
        err instanceof Error ? err.message : "Failed to apply partial payment",
      );
    }
  },
});
