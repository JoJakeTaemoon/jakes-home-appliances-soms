/**
 * EquipmentConsumable validators (added 2026-06).
 *
 * Two responsibilities in one row:
 *   1. Per-unit cycle override (consumableId + replaceEveryDays).
 *   2. Manually-attached filter that isn't on the model's standard
 *      ConsumableOnModel list (consumableId — catalog-but-off-spec —
 *      OR customName — fully off-catalog free text).
 *
 * `consumableId` XOR `customName` enforced via superRefine.
 */

import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const moneyOptional = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom" as const, message: "Invalid amount" });
      return z.NEVER;
    }
    return n;
  });

export const createEquipmentConsumableSchema = z
  .object({
    consumableId: optStr(60),
    customName: optStr(200),
    quantity: z.coerce.number().int().min(1).max(50).default(1),
    replaceEveryDays: z.coerce.number().int().min(1).max(3600).optional(),
    lastReplacedAtOverride: z.coerce.date().nullable().optional(),
    nextReplaceAtOverride: z.coerce.date().nullable().optional(),
    unitPrice: moneyOptional,
    notes: optStr(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.consumableId && !v.customName) {
      ctx.addIssue({
        code: "custom",
        path: ["consumableId"],
        message: "Either consumableId or customName is required",
      });
    }
    if (v.consumableId && v.customName) {
      ctx.addIssue({
        code: "custom",
        path: ["customName"],
        message: "consumableId and customName are mutually exclusive",
      });
    }
    if (!v.consumableId && !v.replaceEveryDays) {
      ctx.addIssue({
        code: "custom",
        path: ["replaceEveryDays"],
        message:
          "replaceEveryDays is required when customName is used (no catalog cycle to fall back on)",
      });
    }
  });

/** Patch shape — every field optional, but the same XOR rules apply
 *  when the touched fields would leave the row in an invalid state.
 *  The route layer re-loads the current row + merges the patch before
 *  hitting these final rules, so the schema itself stays permissive. */
export const updateEquipmentConsumableSchema = z.object({
  customName: optStr(200).nullable(),
  quantity: z.coerce.number().int().min(1).max(50).optional(),
  replaceEveryDays: z.coerce.number().int().min(1).max(3600).nullable().optional(),
  /// Admin override for this filter's last replacement date — null reverts to
  /// the visit-derived date, a date pins the next-due anchor.
  lastReplacedAtOverride: z.coerce.date().nullable().optional(),
  /// Admin override for this filter's next replacement due date — null reverts
  /// to anchor+cycle, a date pins the next-due directly.
  nextReplaceAtOverride: z.coerce.date().nullable().optional(),
  unitPrice: moneyOptional,
  notes: optStr(2000),
});

export type CreateEquipmentConsumableInput = z.infer<typeof createEquipmentConsumableSchema>;
export type UpdateEquipmentConsumableInput = z.infer<typeof updateEquipmentConsumableSchema>;
