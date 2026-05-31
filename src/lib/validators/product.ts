/**
 * Zod validators for the product catalog: ProductCategory, Consumable,
 * Accessory. Consumable enforces "at least one cycle is non-null" — Prisma
 * cannot express CHECK constraints, so this is the single source of truth.
 *
 * Sale prices use VND (integer-like Decimal). We accept numbers via coerce
 * for form submissions; the Prisma schema column is Decimal(14,2).
 */

import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const skuRegex = /^[A-Z0-9][A-Z0-9-]{1,29}$/i;
const categoryCodeRegex = /^[A-Z][A-Z0-9_]{1,29}$/;

// ─────────────────────────────────────────────────────────────────────────
// ProductCategory
// ─────────────────────────────────────────────────────────────────────────

export const createProductCategorySchema = z.object({
  code: z.string().trim().regex(categoryCodeRegex, "Category code must be UPPER_SNAKE_CASE"),
  nameKo: z.string().trim().min(1).max(120),
  nameVi: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
// Hand-built so `.partial()` doesn't carry `.default(true)` on isActive or
// `.default(0)` on sortOrder (mass-assignment via Zod defaults — empty PATCH
// would un-soft-delete the category and reset its sortOrder).
export const updateProductCategorySchema = z.object({
  code: z.string().trim().regex(categoryCodeRegex, "Category code must be UPPER_SNAKE_CASE").optional(),
  nameKo: z.string().trim().min(1).max(120).optional(),
  nameVi: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const productCategoryListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;
export type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>;
export type ProductCategoryListQuery = z.infer<typeof productCategoryListQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────
// Consumable — exactly one of replaceEveryMonths / cleanEveryMonths must
// be non-null; both may be set when a part has two distinct cycles
// (e.g. RO membrane cleaned every 6mo, replaced every 24mo).
// ─────────────────────────────────────────────────────────────────────────

const monthCycle = z.coerce.number().int().min(1).max(600).nullable().optional();

// Per-model compatibility entry. `quantity` reflects how many units of the
// part are installed on a single model (PDF A.1 — most are 1, oversize 2).
const compatibilityEntrySchema = z.object({
  modelId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

const consumableCoreShape = {
  sku: z.string().trim().regex(skuRegex, "SKU must be 2-30 chars, letters/digits/dash"),
  nameKo: z.string().trim().min(1).max(180),
  nameVi: z.string().trim().min(1).max(180),
  nameEn: z.string().trim().min(1).max(180),
  replaceEveryMonths: monthCycle,
  cleanEveryMonths: monthCycle,
  cleanOnEveryVisit: z.boolean().default(false),
  retailPrice: z.coerce.number().nonnegative().max(99999999999.99),
  notes: optStr(2000),
  isActive: z.boolean().default(true),
  compatibleModels: z.array(compatibilityEntrySchema).default([]),
};

function requireAtLeastOneCycle<T extends {
  replaceEveryMonths?: number | null | undefined;
  cleanEveryMonths?: number | null | undefined;
  cleanOnEveryVisit?: boolean | undefined;
}>(data: T, ctx: z.RefinementCtx): void {
  const r = data.replaceEveryMonths;
  const c = data.cleanEveryMonths;
  const v = data.cleanOnEveryVisit;
  if (r == null && c == null && !v) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "At least one of replaceEveryMonths, cleanEveryMonths or cleanOnEveryVisit must be set",
      path: ["replaceEveryMonths"],
    });
  }
}

export const createConsumableSchema = z.object(consumableCoreShape).superRefine(requireAtLeastOneCycle);

// For update we don't know whether the missing field is "unset" or "unchanged";
// the route handler merges with the existing row before re-validating.
export const updateConsumableSchema = z.object({
  sku: consumableCoreShape.sku.optional(),
  nameKo: consumableCoreShape.nameKo.optional(),
  nameVi: consumableCoreShape.nameVi.optional(),
  nameEn: consumableCoreShape.nameEn.optional(),
  replaceEveryMonths: monthCycle,
  cleanEveryMonths: monthCycle,
  cleanOnEveryVisit: z.boolean().optional(),
  retailPrice: consumableCoreShape.retailPrice.optional(),
  notes: optStr(2000),
  isActive: z.boolean().optional(),
  compatibleModels: z.array(compatibilityEntrySchema).optional(),
});

export const consumableListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  modelId: z.string().trim().min(1).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateConsumableInput = z.infer<typeof createConsumableSchema>;
export type UpdateConsumableInput = z.infer<typeof updateConsumableSchema>;
export type ConsumableListQuery = z.infer<typeof consumableListQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────
// Accessory — no cycle, just a sale price + optional compatibility.
// ─────────────────────────────────────────────────────────────────────────

export const createAccessorySchema = z.object({
  sku: z.string().trim().regex(skuRegex, "SKU must be 2-30 chars, letters/digits/dash"),
  nameKo: z.string().trim().min(1).max(180),
  nameVi: z.string().trim().min(1).max(180),
  nameEn: z.string().trim().min(1).max(180),
  // PDF C.2 — minor parts (cocks, valves, hoses, fittings) stay free for
  // MAINTENANCE customers; flips the default charge policy.
  isMinorPart: z.boolean().default(false),
  retailPrice: z.coerce.number().nonnegative().max(99999999999.99),
  notes: optStr(2000),
  isActive: z.boolean().default(true),
  compatibleModels: z.array(compatibilityEntrySchema).default([]),
});
// Hand-built so .partial() doesn't carry `.default()` values onto PATCH
// (mass-assignment via Zod defaults — a PATCH `{}` body would otherwise reset
// `isMinorPart=false` and `isActive=true`, silently flipping billing rules
// and reactivating soft-deleted rows).
export const updateAccessorySchema = z.object({
  sku: z.string().trim().regex(skuRegex, "SKU must be 2-30 chars, letters/digits/dash").optional(),
  nameKo: z.string().trim().min(1).max(180).optional(),
  nameVi: z.string().trim().min(1).max(180).optional(),
  nameEn: z.string().trim().min(1).max(180).optional(),
  isMinorPart: z.boolean().optional(),
  retailPrice: z.coerce.number().nonnegative().max(99999999999.99).optional(),
  notes: optStr(2000),
  isActive: z.boolean().optional(),
  compatibleModels: z.array(compatibilityEntrySchema).optional(),
});

export const accessoryListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  modelId: z.string().trim().min(1).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateAccessoryInput = z.infer<typeof createAccessorySchema>;
export type UpdateAccessoryInput = z.infer<typeof updateAccessorySchema>;
export type AccessoryListQuery = z.infer<typeof accessoryListQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────
// ChargePolicy — overrides for the default billing rule. Each row pins
// (accessory|consumable, contractType, withinWarranty) → isChargeable.
// ─────────────────────────────────────────────────────────────────────────

const chargeContractType = z.enum(["RENTAL", "SALE", "MAINTENANCE"]);

export const createChargePolicySchema = z
  .object({
    accessoryId: z.string().trim().min(1).optional(),
    consumableId: z.string().trim().min(1).optional(),
    contractType: chargeContractType,
    withinWarranty: z.boolean().default(false),
    isChargeable: z.boolean(),
    notes: optStr(500),
  })
  .superRefine((data, ctx) => {
    const hasAccessory = !!data.accessoryId;
    const hasConsumable = !!data.consumableId;
    if (hasAccessory === hasConsumable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of accessoryId or consumableId must be set",
        path: ["accessoryId"],
      });
    }
    if (data.withinWarranty && data.contractType !== "SALE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "withinWarranty only applies to SALE contracts",
        path: ["withinWarranty"],
      });
    }
  });

export const updateChargePolicySchema = z.object({
  isChargeable: z.boolean().optional(),
  notes: optStr(500),
});

export const chargePolicyListQuerySchema = z.object({
  accessoryId: z.string().trim().min(1).optional(),
  consumableId: z.string().trim().min(1).optional(),
  contractType: chargeContractType.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateChargePolicyInput = z.infer<typeof createChargePolicySchema>;
export type UpdateChargePolicyInput = z.infer<typeof updateChargePolicySchema>;
export type ChargePolicyListQuery = z.infer<typeof chargePolicyListQuerySchema>;
