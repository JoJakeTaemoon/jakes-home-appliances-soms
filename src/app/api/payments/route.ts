/**
 * GET  /api/payments  — paginated list with filters
 * POST /api/payments  — manual create EXPECTED payment (STAFF+)
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { PaymentWorkflow } from "@/lib/payments/workflow";
import {
  createPaymentSchema,
  listPaymentQuerySchema,
} from "@/lib/validators/payment";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canViewList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  query: listPaymentQuerySchema,
  paginated: true,
  handler: async ({ auth, query }) => {
    const {
      state,
      customerId,
      contractId,
      method,
      collectedById,
      overdueOnly,
      pendingHandover,
      from,
      to,
      page,
      pageSize,
    } = query;

    const where: Prisma.PaymentWhereInput = {};
    if (state) where.state = state;
    if (customerId) where.customerId = customerId;
    if (contractId) where.contractId = contractId;
    if (method) where.method = method;
    if (overdueOnly) {
      where.state = {
        in: ["OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"],
      };
    }
    if (pendingHandover) {
      where.state = "COLLECTED";
    }
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Prisma.DateTimeFilter).gte = from;
      if (to) (where.createdAt as Prisma.DateTimeFilter).lte = to;
    }

    const scope = PaymentWorkflow.access.scopeForActor(auth.role, auth.userId);
    if ("collectedById" in scope) {
      where.collectedById = scope.collectedById;
    } else if (collectedById) {
      where.collectedById = collectedById;
    }

    const [total, rows] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: { id: true, code: true, name: true, type: true },
          },
          contract: { select: { id: true, contractNumber: true, type: true } },
          visit: { select: { id: true, type: true, scheduledFor: true } },
          collectedBy: { select: { id: true, username: true } },
          taxInvoice: { select: { id: true, invoiceNumber: true } },
        },
      }),
    ]);

    const enriched = rows.map((p) => ({
      ...p,
      expectedAmount: p.expectedAmount.toString(),
      actualAmount: p.actualAmount.toString(),
      carryoverAmount: p.carryoverAmount.toString(),
      daysOverdue: PaymentWorkflow.computeDaysOverdue(p.dueDate),
    }));

    return { rows: enriched, pagination: { page, limit: pageSize, total } };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canCreateExpected(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  body: createPaymentSchema,
  successStatus: 201,
  handler: async ({ auth, body }) => {
    const payment = await PaymentWorkflow.createExpected({
      customerId: body.customerId,
      contractId: body.contractId ?? null,
      expectedAmount: body.expectedAmount,
      dueDate: body.dueDate,
      method: body.method,
      notes: body.notes,
      actorUserId: auth.userId,
    });
    return {
      ...payment,
      expectedAmount: payment.expectedAmount.toString(),
      actualAmount: payment.actualAmount.toString(),
      carryoverAmount: payment.carryoverAmount.toString(),
    };
  },
});
