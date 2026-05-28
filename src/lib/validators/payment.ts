/**
 * Payment validators (Phase 6 — UC-PY-01..07).
 */

import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const money = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom" as const, message: "Invalid amount" });
      return z.NEVER;
    }
    return n;
  });

export const paymentMethodEnum = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "OTHER",
]);

export const paymentStateEnum = z.enum([
  "EXPECTED",
  "COLLECTED",
  "HANDED_OVER",
  "RECONCILED",
  "OVERDUE_D7",
  "OVERDUE_D14",
  "OVERDUE_D30",
  "WRITTEN_OFF",
]);

export const createPaymentSchema = z.object({
  customerId: z.string().trim().min(1),
  contractId: optStr(60),
  expectedAmount: money,
  dueDate: z.coerce.date(),
  method: paymentMethodEnum.optional(),
  notes: optStr(2000),
});

export const listPaymentQuerySchema = z.object({
  state: paymentStateEnum.optional(),
  customerId: optStr(60),
  contractId: optStr(60),
  method: paymentMethodEnum.optional(),
  collectedById: optStr(60),
  overdueOnly: z
    .preprocess(
      (v) => (typeof v === "string" ? v === "true" : Boolean(v)),
      z.boolean(),
    )
    .optional(),
  pendingHandover: z
    .preprocess(
      (v) => (typeof v === "string" ? v === "true" : Boolean(v)),
      z.boolean(),
    )
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export const recordBankTransferSchema = z.object({
  customerId: z.string().trim().min(1),
  contractId: optStr(60),
  expectedPaymentId: optStr(60),
  actualAmount: money,
  reference: z.string().trim().min(1).max(120),
  transferredAt: z.coerce.date(),
  notes: optStr(2000),
});

export const handOverSchema = z.object({}).partial();

export const reconcileSchema = z.object({
  note: optStr(500),
});

export const writeOffSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const applyPartialSchema = z.object({
  partialAmount: money,
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentQuery = z.infer<typeof listPaymentQuerySchema>;
export type RecordBankTransferInput = z.infer<typeof recordBankTransferSchema>;
export type WriteOffInput = z.infer<typeof writeOffSchema>;
export type ApplyPartialInput = z.infer<typeof applyPartialSchema>;
