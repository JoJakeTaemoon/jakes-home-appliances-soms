/**
 * GET /api/tax-invoices/[id]
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { canViewPaymentList } from "@/lib/payments/access";

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
    const inv = await prisma.taxInvoice.findUnique({
      where: { id },
      include: {
        payment: {
          include: {
            customer: { select: { id: true, code: true, name: true, type: true, taxCode: true } },
          },
        },
      },
    });
    if (!inv) throw new NotFoundError("TaxInvoice not found");
    return successResponse({
      ...inv,
      payment: inv.payment
        ? {
            ...inv.payment,
            expectedAmount: inv.payment.expectedAmount.toString(),
            actualAmount: inv.payment.actualAmount.toString(),
            carryoverAmount: inv.payment.carryoverAmount.toString(),
          }
        : null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
