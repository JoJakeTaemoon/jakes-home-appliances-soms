/**
 * GET  /api/inventory/moves?itemKind&itemId  → recent StockMove history.
 * POST /api/inventory/moves                   → manual 입고/출고/조정 (MANAGER+).
 *
 * Every move appends a StockMove row and adjusts the cached stockOnHand in the
 * same transaction via `applyStockMove`. Negative on-hand is allowed.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createStockMoveSchema,
  stockMoveListQuerySchema,
} from "@/lib/validators/inventory";
import { applyStockMove, computeAdjustDelta } from "@/lib/inventory/moves";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: stockMoveListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { itemKind, itemId, page, pageSize } = query;
    const where: Prisma.StockMoveWhereInput =
      itemKind === "MODEL" ? { equipmentModelId: itemId } : { consumableId: itemId };
    const [total, rows] = await Promise.all([
      prisma.stockMove.count({ where }),
      prisma.stockMove.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { createdBy: { select: { id: true, username: true } } },
      }),
    ]);
    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
  },
  body: createStockMoveSchema,
  successStatus: 201,
  handler: async ({ body, auth }) => {
    const { itemKind, itemId } = body;

    return prisma.$transaction(async (tx) => {
      // Lock the target row FOR UPDATE so two concurrent ADJUSTs can't both
      // read the same on-hand and lost-update each other (TOCTOU). This also
      // verifies the item exists.
      const locked =
        itemKind === "MODEL"
          ? await tx.$queryRaw<{ stockOnHand: number }[]>`
              SELECT "stockOnHand" FROM "EquipmentModel" WHERE "id" = ${itemId} FOR UPDATE`
          : await tx.$queryRaw<{ stockOnHand: number }[]>`
              SELECT "stockOnHand" FROM "Consumable" WHERE "id" = ${itemId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundError("Item not found");
      const current = locked[0].stockOnHand;

      const common = {
        itemKind,
        equipmentModelId: itemKind === "MODEL" ? itemId : null,
        consumableId: itemKind === "CONSUMABLE" ? itemId : null,
        unitPrice: body.unitPrice ?? null,
        note: body.note ?? null,
        createdById: auth.userId,
      } as const;

      if (body.action === "RECEIVE") {
        return applyStockMove(tx, {
          ...common,
          direction: "IN",
          quantity: body.quantity,
          reason: "PURCHASE",
        });
      }
      if (body.action === "ISSUE") {
        return applyStockMove(tx, {
          ...common,
          direction: "OUT",
          quantity: body.quantity,
          reason: "ADJUST",
        });
      }
      // ADJUST: quantity is the target on-hand — move by the difference,
      // computed against the locked current value.
      const delta = computeAdjustDelta(body.quantity, current);
      if (delta === 0) {
        throw new ValidationError("Stock already at that quantity", [
          { path: ["quantity"], message: "no change" },
        ]);
      }
      return applyStockMove(tx, {
        ...common,
        direction: delta > 0 ? "IN" : "OUT",
        quantity: Math.abs(delta),
        reason: "ADJUST",
      });
    });
  },
  audit: {
    action: "STOCK_MOVE",
    entityType: "StockMove",
    after: (r) => r,
  },
});
