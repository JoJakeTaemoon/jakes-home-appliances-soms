/**
 * POST /api/payments/[id]/bank-transfer — UC-PY-02. Records a bank transfer
 * settlement against an EXPECTED Payment. STAFF+.
 *
 * Note: this attaches a bank transfer to an existing payment row. To create
 * a standalone bank-transfer payment (rare), POST /api/payments first and
 * then call this endpoint.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { PaymentWorkflow } from "@/lib/payments/workflow";
import { recordBankTransferSchema } from "@/lib/validators/payment";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canRecordBankTransfer(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  params: paramsSchema,
  body: recordBankTransferSchema,
  handler: async ({ auth, body, params }) => {
    const existing = await prisma.payment.findUnique({
      where: { id: params.id },
      select: { customerId: true, contractId: true },
    });
    if (!existing) throw new NotFoundError("Payment not found");

    const updated = await PaymentWorkflow.recordTransfer({
      customerId: existing.customerId,
      contractId: existing.contractId,
      expectedPaymentId: params.id,
      actualAmount: body.actualAmount,
      reference: body.reference,
      transferredAt: body.transferredAt,
      notes: body.notes,
      actorUserId: auth.userId,
    });
    return {
      ...updated,
      expectedAmount: updated.expectedAmount.toString(),
      actualAmount: updated.actualAmount.toString(),
      carryoverAmount: updated.carryoverAmount.toString(),
    };
  },
});
