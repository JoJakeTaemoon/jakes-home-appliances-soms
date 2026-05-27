/**
 * POST /api/payments/[id]/reconcile (UC-PY-05). MANAGER+.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canReconcile } from "@/lib/payments/access";
import { reconcilePayment } from "@/lib/payments/operations";
import { IllegalPaymentTransitionError } from "@/lib/payments/state";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canReconcile(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can reconcile payments");
    }
    const { id } = await ctx.params;

    try {
      const updated = await reconcilePayment({
        paymentId: id,
        reconciledById: auth.userId,
      });
      return successResponse({
        ...updated,
        expectedAmount: updated.expectedAmount.toString(),
        actualAmount: updated.actualAmount.toString(),
        carryoverAmount: updated.carryoverAmount.toString(),
      });
    } catch (err) {
      if (err instanceof IllegalPaymentTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
