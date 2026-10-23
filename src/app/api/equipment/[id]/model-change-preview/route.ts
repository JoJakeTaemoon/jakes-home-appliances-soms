/**
 * GET /api/equipment/:id/model-change-preview?modelId=
 *
 * The unit's filters that moving it onto `modelId` would drop — the edit
 * modal asks before saving when this is not empty.
 */
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { filtersOutsideModel } from "@/lib/equipment/model-change";

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");
  },
  params: z.object({ id: z.string() }),
  query: z.object({ modelId: z.string().trim().min(1) }),
  handler: async ({ params, query }) => {
    const unit = await prisma.equipment.findUnique({ where: { id: params.id }, select: { modelId: true } });
    if (!unit) throw new NotFoundError("Equipment not found");
    if (unit.modelId === query.modelId) return { removed: [] };
    const rows = await filtersOutsideModel(prisma, params.id, query.modelId);
    return { removed: rows.map((r) => ({ consumableId: r.consumableId, ...r.consumable })) };
  },
});
