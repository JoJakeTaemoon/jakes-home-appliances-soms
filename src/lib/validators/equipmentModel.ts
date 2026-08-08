import { z } from "zod";
import { filterPolicySchema } from "./equipment";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

/** One filter in a model's filter config (요청 A): which Consumable, how many,
 *  its order, and an optional per-model replace-cycle override (days). */
const modelFilterSchema = z.object({
  consumableId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  replaceEveryDaysOverride: z.coerce.number().int().min(1).max(18000).nullable().optional(),
});

/** The filter list, rejecting a duplicate consumableId — `createMany` +
 *  skipDuplicates would otherwise silently drop the repeat, losing data. */
const modelFiltersArray = z.array(modelFilterSchema).superRefine((arr, ctx) => {
  const seen = new Set<string>();
  arr.forEach((f, i) => {
    if (seen.has(f.consumableId)) {
      ctx.addIssue({
        code: "custom",
        path: [i, "consumableId"],
        message: "Duplicate filter — each consumable may appear once",
      });
    }
    seen.add(f.consumableId);
  });
});

export const createEquipmentModelSchema = z.object({
  // Customer-facing product names per locale. At least one of the three must
  // be supplied — caller-side validation is enforced by `.superRefine` below.
  nameKo: optStr(180),
  nameVi: optStr(180),
  nameEn: optStr(180),
  brandId: z.string().trim().min(1).nullable().optional(),
  category: z.enum(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"]).nullable().optional(),
  // Reference to ProductCategory. Optional during rollout — when null, the
  // legacy `category` enum is the only classifier. New models should set both.
  categoryId: z.string().trim().min(1).nullable().optional(),
  description: optStr(2000),
  retailPrice: z.coerce.number().nonnegative().nullable().optional(),
  // 판매가 / 입고가 / 지정가 (mockup). All optional; retailPrice stays 소비자가.
  salePrice: z.coerce.number().nonnegative().nullable().optional(),
  purchasePrice: z.coerce.number().nonnegative().nullable().optional(),
  fixedPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyRentalPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyMaintenancePrice: z.coerce.number().nonnegative().nullable().optional(),
  // Opening stock balance (negative allowed). The create handler records an
  // opening StockMove when non-zero so the ledger stays the source of truth.
  stockOnHand: z.coerce.number().int().min(-9999999).max(9999999).default(0),
  safetyStock: z.coerce.number().int().min(0).max(9999999).default(0),
  // PDF A.2 — periodic inspection cycle in months (1 for water purifiers).
  inspectionEveryDays: z.coerce.number().int().min(1).max(18000).nullable().optional(),
  // Warranty period in months for SALE customers — drives the charge-policy
  // default rule. 12 is the legal/business default for purchased equipment.
  warrantyMonths: z.coerce.number().int().min(0).max(600).nullable().optional(),
  filterPolicy: filterPolicySchema.nullable().optional(),
  /// The model's filter config — replaces the picking-from-the-filter-side flow.
  compatibleConsumables: modelFiltersArray.default([]),
  isActive: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (!v.nameKo && !v.nameVi && !v.nameEn) {
    ctx.addIssue({
      code: "custom",
      path: ["nameVi"],
      message: "At least one of nameKo / nameVi / nameEn must be provided",
    });
  }
});

// Hand-built so `.partial()` doesn't carry `.default(true)` on isActive
// (mass-assignment via Zod defaults — a PATCH `{}` body would otherwise
// un-soft-delete a retired model). Mirrors the createEquipmentModelSchema
// shape but every field is .optional() and no defaults are applied.
export const updateEquipmentModelSchema = z.object({
  nameKo: optStr(180),
  nameVi: optStr(180),
  nameEn: optStr(180),
  brandId: z.string().trim().min(1).nullable().optional(),
  category: z.enum(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"]).optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  description: optStr(2000),
  retailPrice: z.coerce.number().nonnegative().nullable().optional(),
  salePrice: z.coerce.number().nonnegative().nullable().optional(),
  purchasePrice: z.coerce.number().nonnegative().nullable().optional(),
  fixedPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyRentalPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyMaintenancePrice: z.coerce.number().nonnegative().nullable().optional(),
  // stockOnHand is intentionally absent — on-hand changes go through the
  // StockMove ledger (POST /api/inventory/moves), never a bare model PATCH.
  safetyStock: z.coerce.number().int().min(0).max(9999999).optional(),
  inspectionEveryDays: z.coerce.number().int().min(1).max(18000).nullable().optional(),
  warrantyMonths: z.coerce.number().int().min(0).max(600).nullable().optional(),
  filterPolicy: filterPolicySchema.nullable().optional(),
  /// When present, the model's filter config is replaced wholesale with this
  /// list (deleteMany + createMany). Omit to leave the existing config alone.
  compatibleConsumables: modelFiltersArray.optional(),
  isActive: z.boolean().optional(),
});

export const equipmentModelListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  category: z.enum(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"]).optional(),
  // Server-side filters used by the bulk-register wizard's model picker.
  brandId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateEquipmentModelInput = z.infer<typeof createEquipmentModelSchema>;
export type UpdateEquipmentModelInput = z.infer<typeof updateEquipmentModelSchema>;
export type EquipmentModelListQuery = z.infer<typeof equipmentModelListQuerySchema>;
