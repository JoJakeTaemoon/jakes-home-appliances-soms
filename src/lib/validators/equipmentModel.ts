import { z } from "zod";
import { filterPolicySchema } from "./equipment";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

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
  monthlyRentalPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyMaintenancePrice: z.coerce.number().nonnegative().nullable().optional(),
  // PDF A.2 — periodic inspection cycle in months (1 for water purifiers).
  inspectionEveryMonths: z.coerce.number().int().min(1).max(600).nullable().optional(),
  // Warranty period in months for SALE customers — drives the charge-policy
  // default rule. 12 is the legal/business default for purchased equipment.
  warrantyMonths: z.coerce.number().int().min(0).max(600).nullable().optional(),
  filterPolicy: filterPolicySchema.nullable().optional(),
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
  monthlyRentalPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyMaintenancePrice: z.coerce.number().nonnegative().nullable().optional(),
  inspectionEveryMonths: z.coerce.number().int().min(1).max(600).nullable().optional(),
  warrantyMonths: z.coerce.number().int().min(0).max(600).nullable().optional(),
  filterPolicy: filterPolicySchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const equipmentModelListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  category: z.enum(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"]).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateEquipmentModelInput = z.infer<typeof createEquipmentModelSchema>;
export type UpdateEquipmentModelInput = z.infer<typeof updateEquipmentModelSchema>;
export type EquipmentModelListQuery = z.infer<typeof equipmentModelListQuerySchema>;
