import { z } from "zod";
import { filterPolicySchema } from "./equipment";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const modelCodeRegex = /^[A-Z0-9][A-Z0-9-]{1,29}$/i;

export const createEquipmentModelSchema = z.object({
  modelCode: z.string().trim().regex(modelCodeRegex, "Model code must be 2-30 chars, letters/digits/dash"),
  name: z.string().trim().min(1).max(180),
  category: z.enum(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"]),
  description: optStr(2000),
  retailPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyRentalPrice: z.coerce.number().nonnegative().nullable().optional(),
  monthlyMaintenancePrice: z.coerce.number().nonnegative().nullable().optional(),
  filterPolicy: filterPolicySchema.nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateEquipmentModelSchema = createEquipmentModelSchema.partial();

export const equipmentModelListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  category: z.enum(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"]).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateEquipmentModelInput = z.infer<typeof createEquipmentModelSchema>;
export type UpdateEquipmentModelInput = z.infer<typeof updateEquipmentModelSchema>;
export type EquipmentModelListQuery = z.infer<typeof equipmentModelListQuerySchema>;
