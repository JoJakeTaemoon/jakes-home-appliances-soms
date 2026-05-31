/**
 * PATCH  /api/admin/products/charge-policies/[id] — edit notes/isChargeable.
 * DELETE /api/admin/products/charge-policies/[id] — drop the override row,
 *        reverting to the default rule.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { updateChargePolicySchema } from "@/lib/validators/product";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await prisma.chargePolicy.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Policy not found");

    const body = await request.json().catch(() => null);
    const parsed = updateChargePolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid policy payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const updated = await prisma.chargePolicy.update({
      where: { id },
      data: parsed.data,
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CHARGE_POLICY_UPDATE",
      entityType: "ChargePolicy",
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

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const { id } = await ctx.params;
    const before = await prisma.chargePolicy.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Policy not found");
    await prisma.chargePolicy.delete({ where: { id } });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CHARGE_POLICY_DELETE",
      entityType: "ChargePolicy",
      entityId: id,
      before,
      after: null,
      request,
    });
    return successResponse({ id, deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
