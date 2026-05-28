/**
 * POST /api/contracts/[id]/renew — UC-CT-06.
 *
 * Returns the freshly-created DRAFT contract. Caller activates it via
 * /api/contracts/[newId]/state once the customer signs the new contract.
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { contractRenewSchema } from "@/lib/validators/contract";
import { ForbiddenError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!ContractWorkflow.access.canRenew(auth.role)) {
      throw new ForbiddenError("Only managers can renew contracts");
    }
  },
  params: paramsSchema,
  body: contractRenewSchema,
  successStatus: 201,
  handler: async ({ auth, body, params, request }) => {
    const result = await ContractWorkflow.renew(
      params.id,
      {
        monthlyMaintenanceFee: body.monthlyMaintenanceFee,
        termMonths: body.termMonths,
        type: body.type,
        startDate: body.startDate,
      },
      { userId: auth.userId, role: auth.role },
      request,
    );
    return { contract: result.contract, parent: result.parent };
  },
});
