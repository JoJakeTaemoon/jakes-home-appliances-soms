/**
 * POST /api/payments/[id]/write-off — MANAGER+.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canWriteOff } from "@/lib/payments/access";
import { writeOff } from "@/lib/payments/operations";
import { writeOffSchema } from "@/lib/validators/payment";
import { IllegalPaymentTransitionError } from "@/lib/payments/state";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canWriteOff(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can write off payments");
    }
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    const parsed = writeOffSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid payload");
    }
    try {
      const updated = await writeOff({
        paymentId: id,
        reason: parsed.data.reason,
        actorUserId: auth.userId,
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
