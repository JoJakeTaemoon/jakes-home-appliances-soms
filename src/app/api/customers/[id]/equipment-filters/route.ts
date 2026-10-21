/**
 * /api/customers/:id/equipment-filters
 *
 * The customer's last filter changes in bulk — a company with 100 units of a
 * model enters the date once, not 100 times.
 *
 * GET  — active units with the filters each one actually carries (the
 *        model's catalog filters minus the ones removed from that unit, plus
 *        the unit's own catalog-filter rows).
 * POST — { equipmentIds, entries: [{ consumableId, lastReplacedAt }] }. For each
 *        unit × filter: update the unit's own row, or create one for a catalog
 *        filter; a unit without that filter (or with it removed) is skipped.
 *        One transaction, one audit row.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { bulkFilterDatesSchema } from "@/lib/validators/equipment";

const paramsSchema = z.object({ id: z.string() });

const authorize = (auth: { role: string }) => {
  if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");
};

const unitSelect = {
  id: true,
  assetCode: true,
  model: {
    select: {
      id: true,
      modelCode: true,
      nameKo: true,
      nameVi: true,
      nameEn: true,
      consumables: { select: { consumableId: true } },
    },
  },
  consumables: {
    where: { consumableId: { not: null } },
    select: { id: true, consumableId: true, excluded: true, lastReplacedAtOverride: true },
  },
} as const;

type Unit = {
  model: { consumables: { consumableId: string }[] } | null;
  consumables: { id: string; consumableId: string | null; excluded: boolean; lastReplacedAtOverride: Date | null }[];
};

/** consumableId → the unit's own row (if any), for every filter the unit carries. */
function filtersOf(u: Unit) {
  const own = new Map(u.consumables.map((c) => [c.consumableId!, c]));
  const ids = new Set([...(u.model?.consumables.map((c) => c.consumableId) ?? []), ...own.keys()]);
  return new Map([...ids].filter((id) => !own.get(id)?.excluded).map((id) => [id, own.get(id) ?? null]));
}

async function assertCustomer(id: string) {
  const c = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!c) throw new NotFoundError("Customer not found");
}

export const GET = defineQuery({
  audience: "staff",
  authorize,
  params: paramsSchema,
  handler: async ({ params }) => {
    await assertCustomer(params.id);
    const units = await prisma.equipment.findMany({
      where: { customerId: params.id, status: "ACTIVE" },
      orderBy: [{ modelId: "asc" }, { assetCode: "asc" }],
      select: unitSelect,
    });
    const consumableIds = [...new Set(units.flatMap((u) => [...filtersOf(u).keys()]))];
    const consumables = await prisma.consumable.findMany({
      where: { id: { in: consumableIds } },
      select: { id: true, sku: true, nameKo: true, nameVi: true, nameEn: true },
    });
    return {
      consumables,
      units: units.map((u) => ({
        id: u.id,
        assetCode: u.assetCode,
        model: u.model && { id: u.model.id, modelCode: u.model.modelCode, nameKo: u.model.nameKo, nameVi: u.model.nameVi, nameEn: u.model.nameEn },
        filters: [...filtersOf(u)].map(([consumableId, row]) => ({
          consumableId,
          lastReplacedAt: row?.lastReplacedAtOverride?.toISOString().slice(0, 10) ?? null,
        })),
      })),
    };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize,
  params: paramsSchema,
  body: bulkFilterDatesSchema,
  handler: async ({ params, body }) => {
    await assertCustomer(params.id);
    const ids = [...new Set(body.equipmentIds)];
    const units = await prisma.equipment.findMany({
      where: { id: { in: ids }, customerId: params.id },
      select: unitSelect,
    });
    if (units.length !== ids.length) throw new ValidationError("Some equipment does not belong to this customer");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    await prisma.$transaction(async (tx) => {
      for (const u of units) {
        const has = filtersOf(u);
        for (const e of body.entries) {
          if (!has.has(e.consumableId)) {
            skipped++;
            continue;
          }
          const row = has.get(e.consumableId);
          if (row) {
            await tx.equipmentConsumable.update({ where: { id: row.id }, data: { lastReplacedAtOverride: e.lastReplacedAt } });
            updated++;
          } else {
            await tx.equipmentConsumable.create({
              data: { equipmentId: u.id, consumableId: e.consumableId, quantity: 1, lastReplacedAtOverride: e.lastReplacedAt },
            });
            created++;
          }
        }
      }
    });
    return { units: units.length, created, updated, skipped };
  },
  audit: {
    action: "EQUIPMENT_FILTER_DATES_BULK_SET",
    entityType: "Customer",
    entityId: (_r, ctx) => ctx.params.id,
    // Flat for the drawer's shallow diff.
    after: (r, ctx) => ({
      ...r,
      equipmentIds: ctx.body.equipmentIds.join(","),
      dates: ctx.body.entries.map((e) => `${e.consumableId}=${e.lastReplacedAt.toISOString().slice(0, 10)}`).join(","),
    }),
  },
});
