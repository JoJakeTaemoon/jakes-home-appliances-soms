/**
 * POST /api/customers/:id/delete — hard-delete a customer. MANAGER+.
 * Body: { actions: { operations|contacts|requests|records: "MOVE"|"DELETE" },
 *         targetCustomerId?, confirmCode } — see src/lib/customers/delete.ts.
 */
import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { canDeleteCustomer } from "@/lib/customers/access";
import { deleteCustomer } from "@/lib/customers/delete";

const action = z.enum(["MOVE", "DELETE"]);
const body = z.object({
  actions: z.object({ operations: action, contacts: action, requests: action, records: action }),
  targetCustomerId: z.string().trim().min(1).nullable().optional(),
  confirmCode: z.string().trim().min(1),
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canDeleteCustomer(auth.role)) throw new ForbiddenError("MANAGER+ required");
  },
  params: z.object({ id: z.string() }),
  body,
  handler: ({ params, body, auth }) =>
    deleteCustomer({
      customerId: params.id,
      actions: body.actions,
      targetCustomerId: body.targetCustomerId,
      confirmCode: body.confirmCode,
      actorId: auth.userId,
    }),
});
