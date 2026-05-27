/**
 * GET /api/portal/invoices — UC-PT-05. B2B-only tax invoice list.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);
    if (caller.customerType !== "B2B") {
      throw new ForbiddenError("Tax invoices are B2B only");
    }
    const rows = await prisma.taxInvoice.findMany({
      where: { payment: { customerId: caller.customerId } },
      orderBy: { invoiceDate: "desc" },
      take: 100,
      include: {
        payment: {
          select: { id: true, actualAmount: true, collectedAt: true, method: true },
        },
      },
    });
    return successResponse(
      rows.map((r) => ({
        ...r,
        payment: r.payment
          ? {
              ...r.payment,
              actualAmount: r.payment.actualAmount.toString(),
            }
          : null,
      })),
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
