/**
 * PATCH /api/orders/[id] — move a PENDING order to DELIVERED (stock leaves
 * for its consumable lines) or CANCELLED. STAFF+; audited inside
 * `transitionOrder` (ORDER_DELIVER / ORDER_CANCEL).
 */

import { z } from "zod";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { canManageEquipment } from "@/lib/customers/access";
import { orderTransitionSchema } from "@/lib/validators/order";
import { transitionOrder } from "@/lib/orders/delivery";

export const PATCH = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot change orders");
    }
  },
  params: z.object({ id: z.string() }),
  body: orderTransitionSchema,
  handler: ({ auth, body, params, request }) =>
    transitionOrder({
      orderId: params.id,
      to: body.state,
      actorId: auth.userId,
      deliveredAt: body.deliveredAt,
      request,
    }),
});
