/**
 * POST /api/contracts/[id]/state — drive the contract state machine.
 *
 * Role policy:
 *   - STAFF can move DRAFT → PENDING_SIGNATURE only.
 *   - MANAGER+ can drive any legal transition (PRD §8.1).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canTransitionContract } from "@/lib/contracts/access";
import { contractStateTransitionSchema } from "@/lib/validators/contract";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { planTransition, IllegalStateTransitionError, type ContractState } from "@/lib/contracts/state";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = contractStateTransitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid state payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const current = await prisma.contract.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("Contract not found");

    const { to, reason } = parsed.data;
    if (!canTransitionContract(auth.role, current.state as ContractState, to as ContractState)) {
      throw new ForbiddenError(`Role ${auth.role} cannot move contract to ${to}`);
    }

    let update;
    try {
      update = planTransition(
        {
          state: current.state as ContractState,
          activatedAt: current.activatedAt,
          signedByCustomerAt: current.signedByCustomerAt,
          signedByCompanyAt: current.signedByCompanyAt,
          terminatedAt: current.terminatedAt,
        },
        to as ContractState,
        { reason: reason ?? null },
      );
    } catch (err) {
      if (err instanceof IllegalStateTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }

    const updated = await prisma.contract.update({ where: { id }, data: update });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: `CONTRACT_STATE_${to}`,
      entityType: "Contract",
      entityId: id,
      before: { state: current.state },
      after: { state: updated.state, reason: reason ?? null },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
