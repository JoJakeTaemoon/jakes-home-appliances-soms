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

const equipmentServiceTypeEnum = z.enum(["RENTAL", "MAINTENANCE", "SALE"]);
const managementTypeEnum = z.enum(["FULL_SERVICE", "SELF_MANAGED", "OTHER"]);
const lifecycleStageEnum = z.enum([
  "INSTALLED",
  "IN_RENTAL",
  "IN_MAINTENANCE",
  "RETRIEVED",
  "REPLACED",
]);

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
   * no EquipmentModel.inspectionEveryDays to inherit. Optional.
   */
  customMaintenanceCycleDays: z.coerce.number().int().min(1).max(3600).optional(),
  serialNumber: optStr(60),
  assetCode: optStr(60),
  ownership: z.enum(["COMPANY", "CUSTOMER"]).default("COMPANY"),
  installedAt: z.coerce.date().optional(),
  installedByTechnicianId: optStr(60),
  // Equipment-centric domain shift (2026-06).
  deposit: z.coerce.number().nonnegative().optional(),
  monthlyFee: z.coerce.number().nonnegative().optional(),
  serviceType: equipmentServiceTypeEnum.optional(),
  managementType: managementTypeEnum.optional(),
  customInspectionCycleDays: z.coerce.number().int().min(1).max(3600).optional(),
  imageUrl: optStr(500),
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
  // RENTAL serviceType requires a deposit.
  if (v.serviceType === "RENTAL" && (v.deposit ?? null) === null) {
    ctx.addIssue({
      code: "custom",
      path: ["deposit"],
      message: "Deposit is required for RENTAL service type",
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
  assetCode: optStr(60),
  ownership: z.enum(["COMPANY", "CUSTOMER"]).optional(),
  installedAt: z.coerce.date().optional(),
  installedByTechnicianId: optStr(60),
  filterPolicyOverride: filterPolicySchema.nullable().optional(),
  customDescription: optStr(500),
  customMaintenanceCycleDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(3600)
    .nullable()
    .optional(),
  // Equipment-centric fields.
  deposit: z.coerce.number().nonnegative().nullable().optional(),
  monthlyFee: z.coerce.number().nonnegative().nullable().optional(),
  serviceType: equipmentServiceTypeEnum.nullable().optional(),
  managementType: managementTypeEnum.nullable().optional(),
  lifecycleStage: lifecycleStageEnum.optional(),
  customInspectionCycleDays: z.coerce.number().int().min(1).max(3600).nullable().optional(),
  imageUrl: optStr(500),
  notes: optStr(2000),
});

// ──────────────────────────────────────────────────────────────────────
// Bulk register wizard — equipment-centric (no contract auto-creation).
// Step 1 = common info, Step 2 = N × serial/installedAt rows.
// API: POST /api/equipment/bulk-register
// ──────────────────────────────────────────────────────────────────────

const bulkRegisterRowSchema = z.object({
  serialNumber: optStr(60),
  assetCode: optStr(60),
  installedAt: z.coerce.date(),
  notes: optStr(500),
});

/** Shared money coercion for the 4-step wizard's optional price fields. */
const money = () => z.coerce.number().min(0).optional();

const serviceConfigFilterSchema = z
  .object({
    consumableId: z.string().trim().min(1).optional(),
    customName: z.string().trim().min(1).max(200).optional(),
    quantity: z.coerce.number().int().min(1).max(99),
    useCycleDays: z.coerce.number().int().min(1).max(3600),
  })
  .superRefine((v, ctx) => {
    // Exactly one of (catalog consumableId) / (customName) — never both,
    // never neither.
    if (!!v.consumableId === !!v.customName) {
      ctx.addIssue({
        code: "custom",
        path: ["consumableId"],
        message: "Exactly one of consumableId or customName is required",
      });
    }
  });

/**
 * Shared per-equipment service config for the 4-step register wizard:
 * inspection cycle (days) + N filter/consumable lines. Each line is either
 * a catalog consumable (consumableId) or a free-text custom part
 * (customName); useCycleDays is always required.
 */
export const serviceConfigSchema = z.object({
  inspectionCycleDays: z.coerce.number().int().min(1).max(3600).optional(),
  filters: z.array(serviceConfigFilterSchema).default([]),
});

export const bulkRegisterEquipmentSchema = z.object({
  // Step 1 — common info applied to every row.
  customerId: z.string().trim().min(1),
  siteId: optStr(60),
  modelId: z.string().trim().min(1),
  serviceType: equipmentServiceTypeEnum,
  managementType: managementTypeEnum.default("FULL_SERVICE"),
  deposit: z.coerce.number().nonnegative().optional(),
  monthlyFee: z.coerce.number().nonnegative().optional(),
  customInspectionCycleDays: z.coerce.number().int().min(1).max(3600).optional(),
  defaultInstalledAt: z.coerce.date(),
  installedByTechnicianId: optStr(60),
  installNotes: optStr(2000),
  // Step 2 — per-row data (length matches quantity).
  rows: z.array(bulkRegisterRowSchema).min(1).max(500),
  // 4-step wizard additions (2026-07): contract linkage + price fields +
  // per-equipment service config (inspection cycle + filter lines).
  contractNumber: optStr(60),
  salePrice: money(),
  installFee: money(),
  monthlyRent: money(),
  monthlyMaintenanceFee: money(),
  hasContract: z.coerce.boolean().optional(),
  serviceConfig: serviceConfigSchema.optional(),
  // Optional: also issue a Contract that bundles every equipment row.
  // The API mints a fresh contractNumber, sets type/state/period from
  // serviceType + termMonths, and creates one ContractEquipment row per
  // generated Equipment.
  createContract: z.coerce.boolean().default(false),
  /** Required when createContract=true. Defaults to 36 for RENTAL. */
  contractTermMonths: z.coerce.number().int().min(1).max(120).optional(),
}).superRefine((v, ctx) => {
  if (v.serviceType === "RENTAL" && (v.deposit ?? null) === null) {
    ctx.addIssue({
      code: "custom",
      path: ["deposit"],
      message: "Deposit is required for RENTAL service type",
    });
  }
  if (v.createContract && v.serviceType !== "SALE" && !v.contractTermMonths) {
    ctx.addIssue({
      code: "custom",
      path: ["contractTermMonths"],
      message: "contractTermMonths is required for RENTAL/MAINTENANCE contracts",
    });
  }
  // SALE requires an explicit salePrice (0 is a valid free-unit price —
  // only null/undefined is rejected, so old callers still posting
  // monthlyFee for SALE fail loudly instead of silently losing the price.
  if (v.serviceType === "SALE" && v.salePrice === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["salePrice"],
      message: "salePrice is required for SALE service type",
    });
  }
});

export type BulkRegisterEquipmentInput = z.infer<typeof bulkRegisterEquipmentSchema>;

// ──────────────────────────────────────────────────────────────────────
// Multi-model register wizard — "장비 등록 / 설치" (2026-06-26).
//
// Unlike bulkRegisterEquipmentSchema, this flow accepts N lines where
// each line carries its own model + price + serviceType + quantity. The
// API expands each line into `quantity` Equipment rows + one Visit per
// row, and (optionally) a single Contract that bundles every generated
// equipment id across all lines.
// ──────────────────────────────────────────────────────────────────────

const registerLineSchema = z
  .object({
    modelId: z.string().trim().min(1),
    serviceType: equipmentServiceTypeEnum,
    managementType: managementTypeEnum.default("FULL_SERVICE"),
    quantity: z.coerce.number().int().min(1).max(500),
    deposit: z.coerce.number().nonnegative().optional(),
    monthlyFee: z.coerce.number().nonnegative().optional(),
    salePrice: money(),
    installFee: money(),
    serviceConfig: serviceConfigSchema.optional(),
    /** Optional serial prefix; auto-generates `{prefix}{seq:04d}` when set. */
    serialPrefix: optStr(60),
    /** Optional per-line install date — falls back to defaultInstalledAt. */
    installedAt: z.coerce.date().optional(),
    notes: optStr(500),
  })
  .superRefine((v, ctx) => {
    if (v.serviceType === "RENTAL" && (v.deposit ?? null) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["deposit"],
        message: "Deposit is required for RENTAL line",
      });
    }
    // SALE requires an explicit salePrice (0 = valid free unit; only
    // null/undefined is rejected) — old UIs still posting monthlyFee for
    // SALE must fail loudly instead of silently losing the price.
    if (v.serviceType === "SALE" && v.salePrice === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: "salePrice is required for SALE line",
      });
    }
  });

export const registerEquipmentSchema = z.object({
  // Common info applied to every generated row when the line doesn't
  // override.
  customerId: z.string().trim().min(1),
  siteId: optStr(60),
  contractNumber: optStr(60),
  defaultInstalledAt: z.coerce.date(),
  installedByTechnicianId: optStr(60),
  installNotes: optStr(2000),
  lines: z.array(registerLineSchema).min(1).max(50),
  // Optional: mint a single Contract bundling every line's equipment.
  createContract: z.coerce.boolean().default(false),
  /** Required when createContract=true + at least one line is non-SALE. */
  contractTermMonths: z.coerce.number().int().min(1).max(120).optional(),
  /** Used to derive Contract.type when the lines mix service types. */
  contractServiceType: equipmentServiceTypeEnum.optional(),
}).superRefine((v, ctx) => {
  if (v.createContract) {
    const hasNonSale = v.lines.some((l) => l.serviceType !== "SALE");
    if (hasNonSale && !v.contractTermMonths) {
      ctx.addIssue({
        code: "custom",
        path: ["contractTermMonths"],
        message: "contractTermMonths is required when any line is RENTAL or MAINTENANCE",
      });
    }
  }
});

export type RegisterEquipmentInput = z.infer<typeof registerEquipmentSchema>;

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
  /**
   * Effective moment the new status takes hold. Office staff can
   * back-date (the device was actually deactivated last Tuesday) or
   * leave undefined → server uses now(). Applied to:
   *   - DEACTIVATED → ContractEquipment.currentPauseStartedAt
   *   - TERMINATED → Equipment.terminatedAt + ContractEquipment.settledAt
   *   - ACTIVE     → closes the open pause window as of this moment
   */
  effectiveAt: z.coerce.date().optional(),
});

/**
 * POST /api/equipment/[id]/retrieval — sets Equipment.retrievedAt for a
 * unit that's already in TERMINATED state. Past dates are allowed
 * because retrieval is often logged after the field visit.
 */
export const equipmentRetrievalSchema = z.object({
  retrievedAt: z.coerce.date(),
  notes: optStr(500),
});

export type EquipmentRetrievalInput = z.infer<typeof equipmentRetrievalSchema>;

export const equipmentListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  customerId: z.string().trim().min(1).optional(),
  siteId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  brandId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "REPLACED", "RELOCATED", "DEACTIVATED", "TERMINATED"]).optional(),
  managementType: managementTypeEnum.optional(),
  serviceType: equipmentServiceTypeEnum.optional(),
  lifecycleStage: lifecycleStageEnum.optional(),
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
