/**
 * GET /api/payments/[id]
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import {
  canViewPaymentList,
  paymentScopeForActor,
} from "@/lib/payments/access";
import { computeDaysOverdue } from "@/lib/payments/operations";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canViewPaymentList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
    const { id } = await ctx.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, code: true, name: true, type: true, taxCode: true },
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

    const scope = paymentScopeForActor(auth.role, auth.userId);
    if ("collectedById" in scope && payment.collectedById !== scope.collectedById) {
      throw new NotFoundError("Payment not found");
    }

    return successResponse({
      ...payment,
      expectedAmount: payment.expectedAmount.toString(),
      actualAmount: payment.actualAmount.toString(),
      carryoverAmount: payment.carryoverAmount.toString(),
      daysOverdue: computeDaysOverdue(payment.dueDate),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
