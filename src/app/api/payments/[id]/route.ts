/**
 * GET /api/payments/[id]
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery, defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { PaymentWorkflow } from "@/lib/payments/workflow";
import { updatePaymentNotesSchema } from "@/lib/validators/payment";

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

/**
 * PATCH /api/payments/[id] — edit the receipt notes before printing (요청 #4).
 * Same access as GET: any office role (ADMIN/MANAGER/STAFF) may edit; the
 * `collectedById`-scoped branch exists only for technicians, who can't hold a
 * staff-audience token, so it's unreachable here (kept for parity with GET).
 * Notes are the one free-text block on the receipt PDF, so office staff can
 * correct/annotate it, then re-download the regenerated receipt.
 */
export const PATCH = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!PaymentWorkflow.access.canViewList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  },
  params: paramsSchema,
  body: updatePaymentNotesSchema,
  handler: async ({ auth, body, params }) => {
    const existing = await prisma.payment.findUnique({
      where: { id: params.id },
      select: { id: true, collectedById: true, notes: true },
    });
    if (!existing) throw new NotFoundError("Payment not found");
    const scope = PaymentWorkflow.access.scopeForActor(auth.role, auth.userId);
    if ("collectedById" in scope && existing.collectedById !== scope.collectedById) {
      throw new NotFoundError("Payment not found");
    }
    const updated = await prisma.payment.update({
      where: { id: params.id },
      data: { notes: body.notes },
      select: { id: true, notes: true },
    });
    return updated;
  },
  audit: {
    action: "PAYMENT_UPDATED",
    entityType: "Payment",
    entityId: (r) => r.id,
    // Note: this framework's audit hooks run AFTER the handler, so a `before`
    // re-query would read the already-updated row — we record only the new
    // notes rather than a misleading "before".
    after: (r) => ({ notes: r.notes }),
  },
});
