/**
 * POST /api/payments/[id]/write-off — MANAGER+.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import {
  PaymentWorkflow,
  IllegalPaymentTransitionError,
} from "@/lib/payments/workflow";
import { writeOffSchema } from "@/lib/validators/payment";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canWriteOff(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can write off payments");
    }
  },
  params: paramsSchema,
  body: writeOffSchema,
  handler: async ({ auth, body, params }) => {
    try {
      const updated = await PaymentWorkflow.writeOff({
        paymentId: params.id,
        reason: body.reason,
        actorUserId: auth.userId,
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
