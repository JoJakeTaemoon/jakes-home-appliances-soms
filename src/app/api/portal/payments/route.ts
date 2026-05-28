/**
 * GET /api/portal/payments — UC-PT-04. Payment history + outstanding balance.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { PaymentWorkflow } from "@/lib/payments/workflow";

export const GET = defineQuery({
  audience: "customer",
  handler: async ({ auth }) => {
    const rows = await prisma.payment.findMany({
      where: { customerId: auth.customerId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        contract: { select: { id: true, contractNumber: true, type: true } },
        taxInvoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    const outstanding = rows
      .filter((p) =>
        ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"].includes(p.state),
      )
      .reduce((acc, p) => acc + Number(p.expectedAmount.toString()), 0);

    return {
      outstanding,
      payments: rows.map((p) => ({
        ...p,
        expectedAmount: p.expectedAmount.toString(),
        actualAmount: p.actualAmount.toString(),
        carryoverAmount: p.carryoverAmount.toString(),
        daysOverdue: PaymentWorkflow.computeDaysOverdue(p.dueDate),
      })),
    };
  },
});
