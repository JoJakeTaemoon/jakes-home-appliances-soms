/**
 * POST /api/equipment/[id]/consumables
 *
 * Attach a per-unit consumable to an Equipment. Either a catalog
 * consumable (`consumableId`) with an optional cycle override, OR a
 * fully off-catalog filter (`customName`) with a mandatory cycle.
 *
 * The list view for this resource is folded into
 * `GET /api/equipment/[id]/filter-history` — catalog + override rows
 * are aggregated there to keep the client UI simple.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import { createEquipmentConsumableSchema } from "@/lib/validators/equipmentConsumable";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot manage equipment");
    }
  },
  params: paramsSchema,
  body: createEquipmentConsumableSchema,
  successStatus: 201,
  handler: async ({ params, body }) => {
    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!equipment) throw new NotFoundError("Equipment not found");

    if (body.consumableId) {
      const c = await prisma.consumable.findUnique({
        where: { id: body.consumableId },
        select: { id: true },
      });
      if (!c) throw new ValidationError("Consumable not found");
    }

    const created = await prisma.equipmentConsumable.create({
      data: {
        equipmentId: params.id,
        consumableId: body.consumableId ?? null,
        customName: body.consumableId ? null : body.customName ?? null,
        quantity: body.quantity,
        replaceEveryDays: body.replaceEveryDays ?? null,
        lastReplacedAtOverride: body.lastReplacedAtOverride ?? null,
        unitPrice: body.unitPrice ?? null,
        notes: body.notes ?? null,
      },
      include: { consumable: true },
    });
    return created;
  },
  audit: {
    action: "EQUIPMENT_CONSUMABLE_ADD",
    entityType: "Equipment",
    entityId: (_r, ctx) => ctx.params.id,
    after: (r) => r,
  },
});
