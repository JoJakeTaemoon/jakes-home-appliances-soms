/**
 * POST /api/payments/[id]/partial (UC-PY-03).
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { canApplyPartial } from "@/lib/payments/access";
import { applyPartialPayment } from "@/lib/payments/operations";
import { applyPartialSchema } from "@/lib/validators/payment";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canApplyPartial(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    const parsed = applyPartialSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid payload");
    }
    try {
      const result = await applyPartialPayment({
        paymentId: id,
        partialAmount: parsed.data.partialAmount,
        actorUserId: auth.userId,
      });
      return successResponse(result);
    } catch (err) {
      throw new ValidationError(
        err instanceof Error ? err.message : "Failed to apply partial payment",
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
