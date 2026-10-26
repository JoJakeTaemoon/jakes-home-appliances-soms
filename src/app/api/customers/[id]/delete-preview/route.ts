/** GET /api/customers/:id/delete-preview — what deleting this customer touches, by group. MANAGER+. */
import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { canDeleteCustomer } from "@/lib/customers/access";
import { customerDeletionPreview } from "@/lib/customers/delete";

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canDeleteCustomer(auth.role)) throw new ForbiddenError("MANAGER+ required");
  },
  params: z.object({ id: z.string() }),
  handler: ({ params }) => customerDeletionPreview(params.id),
});
