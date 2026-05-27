/**
 * GET  /api/payments  — paginated list with filters
 * POST /api/payments  — manual create EXPECTED payment (STAFF+)
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import {
  canCreateExpectedPayment,
  canViewPaymentList,
  paymentScopeForActor,
} from "@/lib/payments/access";
import {
  createPaymentSchema,
  listPaymentQuerySchema,
} from "@/lib/validators/payment";
import { createExpectedPayment, computeDaysOverdue } from "@/lib/payments/operations";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canViewPaymentList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }

    const url = new URL(request.url);
    const parsed = listPaymentQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid query",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
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
    } = parsed.data;

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

    // Technicians see only their own collected payments.
    const scope = paymentScopeForActor(auth.role, auth.userId);
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
          customer: { select: { id: true, code: true, name: true, type: true } },
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
      daysOverdue: computeDaysOverdue(p.dueDate),
    }));

    return paginatedResponse(enriched, { page, limit: pageSize, total });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canCreateExpectedPayment(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
    const body = await request.json().catch(() => null);
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const payment = await createExpectedPayment({
      customerId: parsed.data.customerId,
      contractId: parsed.data.contractId ?? null,
      expectedAmount: parsed.data.expectedAmount,
      dueDate: parsed.data.dueDate,
      method: parsed.data.method,
      notes: parsed.data.notes,
      actorUserId: auth.userId,
    });
    return successResponse(
      {
        ...payment,
        expectedAmount: payment.expectedAmount.toString(),
        actualAmount: payment.actualAmount.toString(),
        carryoverAmount: payment.carryoverAmount.toString(),
      },
      201,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
