/**
 * PATCH /api/customers/[id]/sales-rep — change the customer's sales rep.
 * Body: { salesRepId: string|null, reason?: string }
 * Records an AuditLog entry CUSTOMER_SALES_REP_CHANGED with before/after.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { canUpdateCustomer } from "@/lib/customers/access";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { changeSalesRepSchema } from "@/lib/validators/customer";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!canUpdateCustomer(auth.role)) {
      throw new ForbiddenError("Cannot change sales rep");
    }
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = changeSalesRepSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid sales rep payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { salesRepId, reason } = parsed.data;
    const current = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, code: true, salesRepId: true },
    });
    if (!current) throw new NotFoundError("Customer not found");

    if (salesRepId) {
      // Any active office user is a valid sales rep — see
      // /api/sales-reps for policy rationale.
      const rep = await prisma.user.findFirst({
        where: {
          id: salesRepId,
          role: { in: ["ADMIN", "MANAGER", "STAFF"] },
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!rep) {
        throw new ValidationError("Selected user is not an active office user");
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: { salesRepId },
      include: {
        salesRep: {
          select: { id: true, username: true, title: true, avatarUrl: true },
        },
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CUSTOMER_SALES_REP_CHANGED",
      entityType: "Customer",
      entityId: id,
      before: { salesRepId: current.salesRepId },
      after: { salesRepId, reason },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
