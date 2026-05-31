/**
 * Tax Invoice validators (Phase 6 — UC-TI-01..04).
 */

import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

export const uploadTaxInvoiceMetaSchema = z.object({
  paymentId: z.string().trim().min(1),
  invoiceNumber: z.string().trim().min(1).max(60),
  invoiceDate: z.coerce.date(),
  notes: optStr(500),
});

export const reissueTaxInvoiceSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listTaxInvoiceQuerySchema = z.object({
  customerId: optStr(60),
  paymentId: optStr(60),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z.string().trim().min(1).max(60).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export type UploadTaxInvoiceMeta = z.infer<typeof uploadTaxInvoiceMetaSchema>;
export type ReissueTaxInvoiceInput = z.infer<typeof reissueTaxInvoiceSchema>;
export type ListTaxInvoiceQuery = z.infer<typeof listTaxInvoiceQuerySchema>;
