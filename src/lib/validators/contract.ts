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
});

export const contractStateTransitionSchema = z.object({
  to: z.enum(["PENDING_SIGNATURE", "ACTIVE", "CANCELLED", "TERMINATED", "COMPLETED"]),
  reason: optStr(500),
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
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
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
