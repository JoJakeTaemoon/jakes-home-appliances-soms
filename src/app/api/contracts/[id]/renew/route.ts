/**
 * POST /api/contracts/[id]/renew — UC-CT-06.
 *
 * Returns the freshly-created DRAFT contract. Caller activates it via
 * /api/contracts/[newId]/state once the customer signs the new contract.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { canRenewContract } from "@/lib/contracts/access";
import { contractRenewSchema } from "@/lib/validators/contract";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { prepareRenewal } from "@/lib/contracts/renewal";
import { logAudit } from "@/lib/audit";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canRenewContract(auth.role)) {
      throw new ForbiddenError("Only managers can renew contracts");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = contractRenewSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid renewal payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const result = await prepareRenewal(id, {
      monthlyMaintenanceFee: parsed.data.monthlyMaintenanceFee,
      termMonths: parsed.data.termMonths,
      type: parsed.data.type,
      startDate: parsed.data.startDate,
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_RENEW_PREPARED",
      entityType: "Contract",
      entityId: result.contract.id,
      after: {
        newContractNumber: result.contract.contractNumber,
        parentContractNumber: result.parent.contractNumber,
      },
      request,
    });

    return successResponse({ contract: result.contract, parent: result.parent }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
