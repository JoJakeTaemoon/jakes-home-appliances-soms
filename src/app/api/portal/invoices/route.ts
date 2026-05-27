/**
 * GET /api/portal/invoices — UC-PT-05. B2B-only tax invoice list.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";

export const GET = defineQuery({
  audience: "customer",
  authorize: (auth) => {
    if (auth.customerType !== "B2B") {
      throw new ForbiddenError("Tax invoices are B2B only");
    }
  },
  handler: async ({ auth }) => {
    const rows = await prisma.taxInvoice.findMany({
      where: { payment: { customerId: auth.customerId } },
      orderBy: { invoiceDate: "desc" },
      take: 100,
      include: {
        payment: {
          select: {
            id: true,
            actualAmount: true,
            collectedAt: true,
            method: true,
          },
        },
      },
    });
    return rows.map((r) => ({
      ...r,
      payment: r.payment
        ? {
            ...r.payment,
            actualAmount: r.payment.actualAmount.toString(),
          }
        : null,
    }));
  },
});
