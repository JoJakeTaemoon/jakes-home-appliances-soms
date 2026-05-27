/**
 * POST /api/contracts/[id]/amend — UC-CT-05 (B2B Appendix) + UC-CT-09 (B2C fee adjust).
 *
 * MANAGER+ only. Returns the new (B2B) or updated (B2C) contract.
 *
 * SKIPPED by `defineMutation` refactor: the success status (`201` for new
 * revision, `200` for in-place amend) depends on the workflow result, which
 * the HOF cannot express in its current static-`successStatus` shape.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { contractAmendSchema } from "@/lib/validators/contract";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!ContractWorkflow.access.canAmend(auth.role)) {
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

    const result = await ContractWorkflow.amend(
      id,
      parsed.data,
      { userId: auth.userId, role: auth.role },
      request,
    );

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
