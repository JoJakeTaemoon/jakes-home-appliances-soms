/**
 * What a model change leaves behind on a unit: its own filter rows
 * (EquipmentConsumable) linked to a catalog filter the new model does not
 * carry. Those are dropped on the change so the unit's filters follow its
 * model. Rows for filters the new model shares keep their cycle and dates,
 * and a filter typed in by hand (no catalog link) belongs to the unit, so it
 * stays. The preview route and PATCH /api/equipment/:id both read this.
 */
import type { Prisma } from "@/generated/prisma/client";

type Db = Pick<Prisma.TransactionClient, "consumableOnModel" | "equipmentConsumable">;

export async function filtersOutsideModel(db: Db, equipmentId: string, modelId: string) {
  const carried = await db.consumableOnModel.findMany({ where: { modelId }, select: { consumableId: true } });
  return db.equipmentConsumable.findMany({
    where: { equipmentId, consumableId: { not: null, notIn: carried.map((c) => c.consumableId) } },
    select: {
      id: true,
      consumableId: true,
      consumable: { select: { sku: true, nameKo: true, nameVi: true, nameEn: true } },
    },
  });
}
