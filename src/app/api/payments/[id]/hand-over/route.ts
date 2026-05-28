/**
 * POST /api/payments/[id]/hand-over (UC-PY-04).
 *
 * COLLECTED → HANDED_OVER. The collecting technician can self-hand-over
 * (e.g. dropping cash off at HQ), or office staff records the handover
 * when receiving cash.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  PaymentWorkflow,
  IllegalPaymentTransitionError,
} from "@/lib/payments/workflow";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const current = await prisma.payment.findUnique({
      where: { id: params.id },
      select: { collectedById: true },
    });
    if (!current) throw new NotFoundError("Payment not found");

    if (
      !PaymentWorkflow.access.canHandOver(auth.role, {
        paymentCollectedById: current.collectedById,
        actorUserId: auth.userId,
      })
    ) {
      throw new ForbiddenError(
        "Only the collector or office staff can hand over",
      );
    }

    try {
      const updated = await PaymentWorkflow.handOver({
        paymentId: params.id,
        handedOverById: auth.userId,
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
