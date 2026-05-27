/**
 * POST /api/payments/[id]/bank-transfer — UC-PY-02. Records a bank transfer
 * settlement against an EXPECTED Payment. STAFF+.
 *
 * Note: this attaches a bank transfer to an existing payment row. To create
 * a standalone bank-transfer payment (rare), POST /api/payments first and
 * then call this endpoint.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { canRecordBankTransfer } from "@/lib/payments/access";
import { recordBankTransfer } from "@/lib/payments/operations";
import { recordBankTransferSchema } from "@/lib/validators/payment";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canRecordBankTransfer(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
    const { id } = await ctx.params;
    const existing = await prisma.payment.findUnique({
      where: { id },
      select: { customerId: true, contractId: true },
    });
    if (!existing) throw new NotFoundError("Payment not found");

    const body = await request.json().catch(() => null);
    const parsed = recordBankTransferSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const updated = await recordBankTransfer({
      customerId: existing.customerId,
      contractId: existing.contractId,
      expectedPaymentId: id,
      actualAmount: parsed.data.actualAmount,
      reference: parsed.data.reference,
      transferredAt: parsed.data.transferredAt,
      notes: parsed.data.notes,
      actorUserId: auth.userId,
    });
    return successResponse({
      ...updated,
      expectedAmount: updated.expectedAmount.toString(),
      actualAmount: updated.actualAmount.toString(),
      carryoverAmount: updated.carryoverAmount.toString(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
