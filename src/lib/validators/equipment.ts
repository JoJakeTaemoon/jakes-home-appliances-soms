import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const filterPolicyEntry = z.object({
  type: z.string().trim().min(1).max(60),
  replaceEveryDays: z.number().int().positive().max(36500),
});

export const filterPolicySchema = z.object({
  filters: z.array(filterPolicyEntry).default([]),
});

export const createEquipmentSchema = z.object({
  customerId: z.string().trim().min(1),
  siteId: optStr(60),
  /**
   * Catalog EquipmentModel id. Optional since 2026-06 to support MAINTENANCE
   * contracts on customer-owned external (off-catalog) devices. When null,
   * `customDescription` must be filled in.
   */
  modelId: optStr(60),
  /**
   * Free-text description of an external device (e.g. "타사 정수기 모델 XYZ").
   * Required exactly when `modelId` is null — enforced by the superRefine
   * below.
   */
  customDescription: optStr(500),
  /**
   * Periodic inspection cycle (months) for external equipment when there's
   * no EquipmentModel.inspectionEveryMonths to inherit. Optional.
   */
  customMaintenanceCycle: z.coerce.number().int().min(1).max(120).optional(),
  serialNumber: optStr(60),
  ownership: z.enum(["COMPANY", "CUSTOMER"]).default("COMPANY"),
  installedAt: z.coerce.date().optional(),
  installedByTechnicianId: optStr(60),
  notes: optStr(2000),
}).superRefine((v, ctx) => {
  // Exactly one of (catalog modelId) / (customDescription) must be present.
  if (!v.modelId && !v.customDescription) {
    ctx.addIssue({
      code: "custom",
      path: ["customDescription"],
      message:
        "Either modelId (catalog) or customDescription (external device) is required",
    });
  }
});

/**
 * Bulk install — contract-scoped equipment registration.
 *
 * Added 2026-06: new equipment installation goes through a contract picker
 * and supports per-model quantity + an auto-incrementing serial number
 * suffix. Office staff first selects a contract; the API then derives the
 * customer + ownership and assigns sequential serials.
 *
 * Each `items[]` row produces `quantity` Equipment rows. `serialStart`
 * (optional) is treated as a string; if it ends in a numeric tail, that
 * tail is incremented and zero-padded across the batch. If it does NOT
 * end in digits, items are suffixed with `-1`, `-2`, … instead.
 *
 * The `siteId` field is enforced server-side: for customers with ≥2
 * sites, every item must specify a siteId; for single-site / B2C the
 * field is ignored when null.
 */
const bulkInstallItemSchema = z
  .object({
    modelId: z.string().trim().min(1, "modelId is required"),
    quantity: z.coerce.number().int().min(1).max(50),
    serialStart: optStr(60),
    siteId: optStr(60),
    installedAt: z.coerce.date().optional(),
    installedByTechnicianId: optStr(60),
    ownership: z.enum(["COMPANY", "CUSTOMER"]).default("COMPANY"),
    unitPrice: z.coerce.number().nonnegative().optional(),
    notes: optStr(2000),
  });

export const bulkInstallEquipmentSchema = z.object({
  items: z.array(bulkInstallItemSchema).min(1).max(20),
});

export type BulkInstallEquipmentInput = z.infer<typeof bulkInstallEquipmentSchema>;
export type BulkInstallItemInput = z.infer<typeof bulkInstallItemSchema>;

/**
 * Generate a sequence of serial numbers given a starting serial + count.
 * - "PTS-2100-000010" + 3 → ["PTS-2100-000010", "PTS-2100-000011", "PTS-2100-000012"]
 * - "ABC" + 3 → ["ABC-1", "ABC-2", "ABC-3"]
 * - undefined → array of `count` nulls (no serial assigned)
 */
export function generateSerialSequence(
  start: string | null | undefined,
  count: number,
): (string | null)[] {
  if (!start) return Array.from({ length: count }, () => null);
  const m = /^(.*?)(\d+)$/.exec(start);
  if (m) {
    const [, prefix, digits] = m;
    const pad = digits.length;
    const base = Number(digits);
    return Array.from({ length: count }, (_, i) =>
      `${prefix}${String(base + i).padStart(pad, "0")}`,
    );
  }
  return Array.from({ length: count }, (_, i) => `${start}-${i + 1}`);
}

export const updateEquipmentSchema = z.object({
  serialNumber: optStr(60),
  ownership: z.enum(["COMPANY", "CUSTOMER"]).optional(),
  installedAt: z.coerce.date().optional(),
  installedByTechnicianId: optStr(60),
  filterPolicyOverride: filterPolicySchema.nullable().optional(),
  customDescription: optStr(500),
  customMaintenanceCycle: z.coerce
    .number()
    .int()
    .min(1)
    .max(120)
    .nullable()
    .optional(),
  notes: optStr(2000),
});

export const moveSiteSchema = z.object({
  siteId: z.string().trim().min(1).nullable(),
  reason: z.string().trim().max(500).optional(),
});

export const replaceEquipmentSchema = z.object({
  newModelId: z.string().trim().min(1),
  newSerialNumber: optStr(60),
  installedAt: z.coerce.date().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const equipmentStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DEACTIVATED", "TERMINATED", "RELOCATED", "REPLACED"]),
  reason: z.string().trim().max(500).optional(),
});

export const equipmentListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  customerId: z.string().trim().min(1).optional(),
  siteId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "REPLACED", "RELOCATED", "DEACTIVATED", "TERMINATED"]).optional(),
  region: z.string().trim().max(60).optional(),
  sortBy: z.string().trim().min(1).max(60).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
export type MoveSiteInput = z.infer<typeof moveSiteSchema>;
export type ReplaceEquipmentInput = z.infer<typeof replaceEquipmentSchema>;
export type EquipmentListQuery = z.infer<typeof equipmentListQuerySchema>;
