/**
 * POST /api/payments/[id]/hand-over (UC-PY-04).
 *
 * COLLECTED → HANDED_OVER. The collecting technician can self-hand-over
 * (e.g. dropping cash off at HQ), or office staff records the handover
 * when receiving cash.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { canHandOver } from "@/lib/payments/access";
import { handOverCash } from "@/lib/payments/operations";
import { IllegalPaymentTransitionError } from "@/lib/payments/state";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    const { id } = await ctx.params;

    const current = await prisma.payment.findUnique({
      where: { id },
      select: { collectedById: true },
    });
    if (!current) throw new NotFoundError("Payment not found");

    if (
      !canHandOver(auth.role, {
        paymentCollectedById: current.collectedById,
        actorUserId: auth.userId,
      })
    ) {
      throw new ForbiddenError("Only the collector or office staff can hand over");
    }

    try {
      const updated = await handOverCash({
        paymentId: id,
        handedOverById: auth.userId,
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
