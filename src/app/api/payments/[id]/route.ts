/**
 * GET /api/payments/[id]
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { PaymentWorkflow } from "@/lib/payments/workflow";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canViewList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            taxCode: true,
          },
        },
        contract: { select: { id: true, contractNumber: true, type: true } },
        visit: {
          select: { id: true, type: true, scheduledFor: true, completedAt: true },
        },
        collectedBy: { select: { id: true, username: true, phone: true } },
        taxInvoice: true,
        documents: {
          orderBy: { generatedAt: "desc" },
          select: {
            id: true,
            kind: true,
            templateCode: true,
            storageKey: true,
            filename: true,
            generatedAt: true,
          },
        },
      },
    });
    if (!payment) throw new NotFoundError("Payment not found");

    const scope = PaymentWorkflow.access.scopeForActor(auth.role, auth.userId);
    if (
      "collectedById" in scope &&
      payment.collectedById !== scope.collectedById
    ) {
      throw new NotFoundError("Payment not found");
    }

    return {
      ...payment,
      expectedAmount: payment.expectedAmount.toString(),
      actualAmount: payment.actualAmount.toString(),
      carryoverAmount: payment.carryoverAmount.toString(),
      daysOverdue: PaymentWorkflow.computeDaysOverdue(payment.dueDate),
    };
  },
});
