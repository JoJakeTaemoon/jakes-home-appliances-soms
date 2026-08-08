/**
 * Inventory ledger seam. Every stock change — manual 입고/출고/조정 and the
 * automatic OUT moves on install / filter-replace / order-delivery — goes
 * through `applyStockMove`, which appends a StockMove row (history-of-record)
 * and adjusts the cached `stockOnHand` counter on the target Model/Consumable
 * in the SAME transaction.
 *
 * Negative on-hand is allowed by design: the ledger records reality; low/negative
 * stock surfaces as an alert in the UI, it never blocks a field operation.
 */

import type {
  Prisma,
  StockDirection,
  StockItemKind,
  StockMoveReason,
} from "@/generated/prisma/client";

/**
 * Delta for an ADJUST move that sets on-hand to `target`. Positive → IN,
 * negative → OUT, zero → no change. Pure so the arithmetic is unit-testable
 * (the route reads `current` under a row lock to avoid lost updates).
 */
export function computeAdjustDelta(target: number, current: number): number {
  return target - current;
}

export interface StockMoveInput {
  itemKind: StockItemKind; // "MODEL" | "CONSUMABLE"
  equipmentModelId?: string | null;
  consumableId?: string | null;
  direction: StockDirection; // "IN" | "OUT"
  quantity: number; // always positive; direction carries the sign
  reason: StockMoveReason;
  unitPrice?: number | null;
  sourceType?: string | null; // "ORDER" | "VISIT" | "EQUIPMENT" | null (manual)
  sourceId?: string | null;
  note?: string | null;
  createdById?: string | null;
}

/**
 * Append a StockMove and adjust the target row's cached `stockOnHand`, inside
 * the caller's transaction. Returns the created move.
 *
 * The caller MUST pass a positive `quantity`; `direction` decides the sign of
 * the on-hand delta (OUT decrements, IN increments).
 */
export async function applyStockMove(
  tx: Prisma.TransactionClient,
  input: StockMoveInput,
) {
  if (input.quantity <= 0) {
    throw new Error("StockMove quantity must be positive");
  }
  const delta = input.direction === "OUT" ? -input.quantity : input.quantity;

  const move = await tx.stockMove.create({
    data: {
      itemKind: input.itemKind,
      equipmentModelId: input.itemKind === "MODEL" ? input.equipmentModelId ?? null : null,
      consumableId: input.itemKind === "CONSUMABLE" ? input.consumableId ?? null : null,
      direction: input.direction,
      quantity: input.quantity,
      reason: input.reason,
      unitPrice: input.unitPrice ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });

  if (input.itemKind === "MODEL" && input.equipmentModelId) {
    await tx.equipmentModel.update({
      where: { id: input.equipmentModelId },
      data: { stockOnHand: { increment: delta } },
    });
  } else if (input.itemKind === "CONSUMABLE" && input.consumableId) {
    await tx.consumable.update({
      where: { id: input.consumableId },
      data: { stockOnHand: { increment: delta } },
    });
  }

  return move;
}

/**
 * Record an opening balance for a freshly-created item as a single ADJUST move.
 * No-op when qty is 0. `qty` may be negative (opening deficit).
 */
export async function recordOpeningStock(
  tx: Prisma.TransactionClient,
  args: {
    itemKind: StockItemKind;
    equipmentModelId?: string | null;
    consumableId?: string | null;
    qty: number;
    createdById?: string | null;
  },
) {
  if (!args.qty) return null;
  return applyStockMove(tx, {
    itemKind: args.itemKind,
    equipmentModelId: args.equipmentModelId,
    consumableId: args.consumableId,
    direction: args.qty > 0 ? "IN" : "OUT",
    quantity: Math.abs(args.qty),
    reason: "ADJUST",
    note: "opening balance",
    createdById: args.createdById,
  });
}
