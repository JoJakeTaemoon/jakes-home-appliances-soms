/**
 * GET /api/tax-invoices/[id]
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { canViewPaymentList } from "@/lib/payments/access";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewPaymentList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  params: paramsSchema,
  handler: async ({ params }) => {
    const inv = await prisma.taxInvoice.findUnique({
      where: { id: params.id },
      include: {
        payment: {
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
          },
        },
      },
    });
    if (!inv) throw new NotFoundError("TaxInvoice not found");
    return {
      ...inv,
      payment: inv.payment
        ? {
            ...inv.payment,
            expectedAmount: inv.payment.expectedAmount.toString(),
            actualAmount: inv.payment.actualAmount.toString(),
            carryoverAmount: inv.payment.carryoverAmount.toString(),
          }
        : null,
    };
  },
});
