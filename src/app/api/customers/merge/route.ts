/**
 * POST /api/customers/merge — ADMIN only.
 * Body: { sourceId, targetId }
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { mergeCustomers } from "@/lib/customers/merge";

const schema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "ADMIN") throw new ForbiddenError("ADMIN required");
  },
  body: schema,
  handler: ({ auth, body }) =>
    mergeCustomers({
      sourceId: body.sourceId,
      targetId: body.targetId,
      actorId: auth.userId,
    }),
});
