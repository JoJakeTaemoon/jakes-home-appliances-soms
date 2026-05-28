/**
 * POST /api/contracts/[id]/state — drive the contract state machine.
 *
 * Role policy:
 *   - STAFF can move DRAFT → PENDING_SIGNATURE only.
 *   - MANAGER+ can drive any legal transition (PRD §8.1).
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { contractStateTransitionSchema } from "@/lib/validators/contract";
import type { ContractState } from "@/lib/contracts/workflow";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  params: paramsSchema,
  body: contractStateTransitionSchema,
  handler: ({ auth, body, params, request }) =>
    ContractWorkflow.transition({
      contractId: params.id,
      to: body.to as ContractState,
      reason: body.reason ?? null,
      actor: { userId: auth.userId, role: auth.role },
      request,
    }),
});
