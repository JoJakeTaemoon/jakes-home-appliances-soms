/**
 * POST /api/contracts/[id]/amend — UC-CT-05 (B2B Appendix) + UC-CT-09 (B2C fee adjust).
 *
 * MANAGER+ only. Returns the new (B2B) or updated (B2C) contract.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { canAmendContract } from "@/lib/contracts/access";
import { contractAmendSchema } from "@/lib/validators/contract";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { createAmendment } from "@/lib/contracts/amend";
import { logAudit } from "@/lib/audit";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canAmendContract(auth.role)) {
      throw new ForbiddenError("Only managers can amend contracts");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => null);
    const parsed = contractAmendSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid amendment payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const result = await createAmendment(id, parsed.data);

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_AMEND",
      entityType: "Contract",
      entityId: result.isNewRevision ? result.contract.id : id,
      before: result.before,
      after: result.after,
      request,
    });

    return successResponse(
      {
        contract: result.contract,
        isNewRevision: result.isNewRevision,
      },
      result.isNewRevision ? 201 : 200,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
