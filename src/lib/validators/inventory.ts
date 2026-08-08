/**
 * Validators for the manual inventory endpoints (입고/출고/조정).
 *
 * `action`:
 *   RECEIVE — 입고: add `quantity` (IN, reason PURCHASE)
 *   ISSUE   — 출고: remove `quantity` (OUT, reason ADJUST — a manual write-off)
 *   ADJUST  — 조정: set on-hand to `quantity` (target); handler computes the delta
 *
 * For RECEIVE/ISSUE `quantity` must be positive. For ADJUST it is the target
 * on-hand and may be any integer (negative allowed — the ledger permits deficits).
 */

import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

export const createStockMoveSchema = z
  .object({
    itemKind: z.enum(["MODEL", "CONSUMABLE"]),
    itemId: z.string().trim().min(1),
    action: z.enum(["RECEIVE", "ISSUE", "ADJUST"]),
    quantity: z.coerce.number().int().min(-9999999).max(9999999),
    unitPrice: z.coerce.number().nonnegative().max(99999999999.99).nullable().optional(),
    note: optStr(500),
  })
  .superRefine((d, ctx) => {
    if ((d.action === "RECEIVE" || d.action === "ISSUE") && d.quantity <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "quantity must be positive for 입고/출고",
      });
    }
  });

export const stockMoveListQuerySchema = z.object({
  itemKind: z.enum(["MODEL", "CONSUMABLE"]),
  itemId: z.string().trim().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateStockMoveInput = z.infer<typeof createStockMoveSchema>;
export type StockMoveListQuery = z.infer<typeof stockMoveListQuerySchema>;
