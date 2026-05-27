/**
 * POST /api/customers/[id]/deactivate — UC-CM-05.
 *
 * Sets the customer to INACTIVE, cascades active equipment to DEACTIVATED,
 * and cascades non-terminal contracts to TERMINATED.
 * MANAGER+ only.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canDeactivateCustomer } from "@/lib/customers/access";
import { deactivateCustomerSchema } from "@/lib/validators/customer";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!canDeactivateCustomer(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = deactivateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { reason } = parsed.data;

    const before = await prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Customer not found");
    if (before.status === "INACTIVE") {
      throw new ValidationError("Customer is already inactive");
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: {
          status: "INACTIVE",
          deactivatedAt: new Date(),
          deactivationReason: reason,
        },
      });
      const equipmentResult = await tx.equipment.updateMany({
        where: { customerId: id, status: { in: ["ACTIVE", "RELOCATED"] } },
        data: { status: "DEACTIVATED" },
      });
      const contractResult = await tx.contract.updateMany({
        where: {
          customerId: id,
          state: { in: ["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "AMENDED"] },
        },
        data: {
          state: "TERMINATED",
          terminatedAt: new Date(),
          terminationReason: `Customer deactivated: ${reason}`,
        },
      });
      return { updated, equipmentCount: equipmentResult.count, contractCount: contractResult.count };
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CUSTOMER_DEACTIVATE",
      entityType: "Customer",
      entityId: id,
      before,
      after: {
        ...result.updated,
        cascadedEquipment: result.equipmentCount,
        cascadedContracts: result.contractCount,
        reason,
      },
      request,
    });

    return successResponse(result.updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
