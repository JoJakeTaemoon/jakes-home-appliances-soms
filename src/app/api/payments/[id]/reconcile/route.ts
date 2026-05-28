/**
 * POST /api/payments/[id]/reconcile (UC-PY-05). MANAGER+.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import {
  PaymentWorkflow,
  IllegalPaymentTransitionError,
} from "@/lib/payments/workflow";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canReconcile(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can reconcile payments");
    }
  },
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    try {
      const updated = await PaymentWorkflow.reconcile({
        paymentId: params.id,
        reconciledById: auth.userId,
      });
      return {
        ...updated,
        expectedAmount: updated.expectedAmount.toString(),
        actualAmount: updated.actualAmount.toString(),
        carryoverAmount: updated.carryoverAmount.toString(),
      };
    } catch (err) {
      if (err instanceof IllegalPaymentTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  },
});
