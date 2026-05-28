/**
 * POST /api/customers/[id]/reactivate — ADMIN only.
 *
 * Reverses Customer.deactivate by flipping status back to ACTIVE. Equipment
 * status is NOT automatically restored — Manager picks per-unit (UC-CM-05).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canReactivateCustomer } from "@/lib/customers/access";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!canReactivateCustomer(auth.role)) {
      throw new ForbiddenError("ADMIN required to reactivate customer");
    }
    const { id } = await ctx.params;

    const before = await prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Customer not found");
    if (before.status === "ACTIVE") {
      throw new ValidationError("Customer is already active");
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        status: "ACTIVE",
        deactivatedAt: null,
        deactivationReason: null,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CUSTOMER_REACTIVATE",
      entityType: "Customer",
      entityId: id,
      before,
      after: updated,
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
