/**
 * Zod validators for the SalesRep (판매원) master.
 *
 * A rep is a person who sells, not a login: only the name is required so the
 * office can add one mid-form while creating a customer and fill in the rest
 * later.
 */

import { z } from "zod";

const optStr = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.union([z.string().trim().max(max), z.null()]),
  ).optional();

export const createSalesRepSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: optStr(40),
  email: optStr(180),
  title: optStr(60),
  notes: optStr(2000),
});

// Hand-built rather than `.partial()` so no `.default()` leaks onto PATCH
// (an empty body would otherwise reactivate a deactivated rep).
export const updateSalesRepSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: optStr(40),
  email: optStr(180),
  title: optStr(60),
  notes: optStr(2000),
  isActive: z.boolean().optional(),
});

export type CreateSalesRepInput = z.infer<typeof createSalesRepSchema>;
export type UpdateSalesRepInput = z.infer<typeof updateSalesRepSchema>;
