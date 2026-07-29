/**
 * GET /api/equipment-models/[id]/consumables
 *
 * Default consumables catalog for one equipment model — feeds the bulk
 * equipment registration wizard's filter table (Task 1.1). Returns each
 * ConsumableOnModel row's default quantity flattened together with the
 * Consumable's own cycle/price fields.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot view equipment models");
    }
  },
  params: paramsSchema,
  handler: async ({ params }) => {
    const model = await prisma.equipmentModel.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!model) throw new NotFoundError("Model not found");

    const rows = await prisma.consumableOnModel.findMany({
      where: { modelId: params.id },
      orderBy: { sortOrder: "asc" },
      select: {
        quantity: true,
        replaceEveryDaysOverride: true,
        consumable: {
          select: {
            id: true,
            sku: true,
            nameKo: true,
            nameVi: true,
            nameEn: true,
            replaceEveryDays: true,
            cleanEveryDays: true,
            cleanOnEveryVisit: true,
            retailPrice: true,
          },
        },
      },
    });

    return rows.map((r) => ({
      consumableId: r.consumable.id,
      sku: r.consumable.sku,
      name: { ko: r.consumable.nameKo, vi: r.consumable.nameVi, en: r.consumable.nameEn },
      // Per-model cycle override wins over the filter's own default.
      replaceEveryDays: r.replaceEveryDaysOverride ?? r.consumable.replaceEveryDays,
      cleanEveryDays: r.consumable.cleanEveryDays,
      cleanOnEveryVisit: r.consumable.cleanOnEveryVisit,
      defaultQuantity: r.quantity,
      retailPrice: r.consumable.retailPrice,
    }));
  },
});
