/**
 * GET /api/portal/payments — UC-PT-04. Payment history + outstanding balance.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { computeDaysOverdue } from "@/lib/payments/operations";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);

    const rows = await prisma.payment.findMany({
      where: { customerId: caller.customerId },
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

    return successResponse({
      outstanding,
      payments: rows.map((p) => ({
        ...p,
        expectedAmount: p.expectedAmount.toString(),
        actualAmount: p.actualAmount.toString(),
        carryoverAmount: p.carryoverAmount.toString(),
        daysOverdue: computeDaysOverdue(p.dueDate),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
