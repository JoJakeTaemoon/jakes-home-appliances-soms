/**
 * Contract validators (Phase 3).
 *
 * - createContractSchema: discriminated union on `type` (SALE / RENTAL / MAINTENANCE).
 * - updateContractSchema: partial field updates for DRAFT (or notes-only for ACTIVE).
 * - contractStateTransitionSchema: state-machine moves.
 * - contractAmendSchema: B2B Appendix or B2C in-place fee bump.
 * - contractRenewSchema: 1-click renewal pre-fill.
 * - contractListQuerySchema: list endpoint filters.
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
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({
        code: "custom" as const,
        message: "Invalid money value (must be a non-negative number)",
      });
      return z.NEVER;
    }
    return n;
  });

const moneyRequired = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({
        code: "custom" as const,
        message: "Invalid money value (must be a non-negative number)",
      });
      return z.NEVER;
    }
    return n;
  });

export const endOfTermActionEnum = z.enum([
  "TRANSFER_OWNERSHIP",
  "RETRIEVE_DEVICE",
]);

const equipmentLineSchema = z.object({
  equipmentId: z.string().trim().min(1),
  unitPrice: moneyOptional,
  quantity: z.coerce.number().int().min(1).max(10_000).default(1),
  notes: optStr(500),
});

const contractBase = z.object({
  customerId: z.string().trim().min(1),
  equipment: z.array(equipmentLineSchema).min(1).max(200),
  startDate: z.coerce.date().optional(),
  signedAt: z.coerce.date().optional(),
  notes: optStr(2000),
  filterPolicy: z.unknown().optional(),
});

export const createContractSchema = z.discriminatedUnion("type", [
  contractBase.extend({
    type: z.literal("SALE"),
    totalContractValue: moneyOptional,
  }),
  contractBase.extend({
    type: z.literal("RENTAL"),
    monthlyMaintenanceFee: moneyOptional,
    termMonths: z.coerce.number().int().min(1).max(120).default(36),
    /**
     * Deposit collected up-front at the installation visit. Always present
     * on RENTAL contracts since 2026-06; refundable via a DEPOSIT_REFUND
     * payment row at mid-term cancellation or RENTAL→SALE conversion.
     */
    deposit: moneyRequired,
    /**
     * What happens to the equipment at end-of-term. Defaults to
     * TRANSFER_OWNERSHIP (matches historical behavior); RETRIEVE_DEVICE
     * means the cron skips the ownership flip and auto-spawns a RETRIEVAL
     * visit at end date.
     */
    endOfTermAction: endOfTermActionEnum.default("TRANSFER_OWNERSHIP"),
  }),
  contractBase.extend({
    type: z.literal("MAINTENANCE"),
    monthlyMaintenanceFee: moneyOptional,
    termMonths: z.coerce.number().int().min(1).max(120).optional(),
  }),
]);

export const updateContractSchema = z.object({
  notes: optStr(2000),
  startDate: z.coerce.date().nullable().optional(),
  signedAt: z.coerce.date().nullable().optional(),
  termMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  monthlyMaintenanceFee: moneyOptional,
  totalContractValue: moneyOptional,
  deposit: moneyOptional,
  endOfTermAction: endOfTermActionEnum.optional(),
});

export const contractStateTransitionSchema = z.object({
  to: z.enum(["PENDING_SIGNATURE", "ACTIVE", "CANCELLED", "TERMINATED", "COMPLETED"]),
  reason: optStr(500),
});

/**
 * Mid-term cancellation. Drives the TERMINATED transition plus optional
 * DEPOSIT_REFUND payment row + RETRIEVAL visit auto-spawn. Reason is
 * required (≥5 chars) so the audit trail stays useful.
 */
export const contractTerminateSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  refundAmount: moneyOptional,
  /**
   * When true, an auto-spawned SUGGESTED RETRIEVAL visit gets created so
   * the office can dispatch a technician to collect the device. Defaults
   * to whatever endOfTermAction the contract has at the API layer.
   */
  requireRetrieval: z.boolean().optional(),
});

/**
 * RENTAL → SALE in-place conversion (decided 2026-06). The contract row
 * keeps its id; `type` flips to SALE, totalContractValue replaces the
 * rental fee, `convertedFromType` + `convertedAt` get stamped. A
 * DEPOSIT_REFUND payment row may be generated when `refundDeposit` is
 * true.
 */
export const contractConvertSchema = z.object({
  targetType: z.literal("SALE"),
  salePrice: moneyRequired,
  refundDeposit: z.boolean(),
  refundAmount: moneyOptional,
  reason: z.string().trim().min(5).max(500),
});

const amendBase = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const contractAmendSchema = z.discriminatedUnion("changeType", [
  amendBase.extend({
    changeType: z.literal("FEE_ADJUST"),
    monthlyMaintenanceFee: z
      .union([z.number(), z.string()])
      .transform((v, ctx) => {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n) || n < 0) {
          ctx.addIssue({
            code: "custom" as const,
            message: "Invalid fee (must be a non-negative number)",
          });
          return z.NEVER;
        }
        return n;
      }),
  }),
  amendBase.extend({
    changeType: z.literal("ADD_EQUIPMENT"),
    equipment: z.array(equipmentLineSchema).min(1).max(200),
    monthlyMaintenanceFee: moneyOptional,
  }),
  amendBase.extend({
    changeType: z.literal("REMOVE_EQUIPMENT"),
    equipment: z.array(equipmentLineSchema).min(1).max(200),
    monthlyMaintenanceFee: moneyOptional,
  }),
  amendBase.extend({
    changeType: z.literal("SCOPE_CHANGE"),
    equipment: z.array(equipmentLineSchema).min(1).max(200).optional(),
    monthlyMaintenanceFee: moneyOptional,
  }),
]);

export const contractRenewSchema = z.object({
  monthlyMaintenanceFee: moneyOptional,
  termMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  type: z.enum(["SALE", "RENTAL", "MAINTENANCE"]).optional(),
  startDate: z.coerce.date().optional(),
});

export const contractListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  customerId: z.string().trim().min(1).optional(),
  type: z.enum(["SALE", "RENTAL", "MAINTENANCE"]).optional(),
  state: z.enum([
    "DRAFT",
    "PENDING_SIGNATURE",
    "ACTIVE",
    "AMENDED",
    "COMPLETED",
    "TERMINATED",
    "CANCELLED",
  ]).optional(),
  endingBefore: z.coerce.date().optional(),
  customerType: z.enum(["B2C", "B2B"]).optional(),
  startDateFrom: z.coerce.date().optional(),
  startDateTo: z.coerce.date().optional(),
  sortBy: z.string().trim().min(1).max(60).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export const contractEmailSchema = z.object({
  /** Override recipient email; defaults to Contract Party email. */
  recipientEmail: z.string().email().optional(),
  /** Override locale; defaults to Contract Party language. */
  locale: z.enum(["ko", "vi", "en"]).optional(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type ContractStateTransitionInput = z.infer<typeof contractStateTransitionSchema>;
export type ContractAmendInput = z.infer<typeof contractAmendSchema>;
export type ContractRenewInput = z.infer<typeof contractRenewSchema>;
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;
export type ContractEmailInput = z.infer<typeof contractEmailSchema>;
export type ContractTerminateInput = z.infer<typeof contractTerminateSchema>;
export type ContractConvertInput = z.infer<typeof contractConvertSchema>;
