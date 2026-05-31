/**
 * Zod validators for the Brand entity. Phase 2 starts with a single `name`
 * field; future iterations may add codes for accounting/AR aggregation.
 */

import { z } from "zod";

export const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
// Hand-built so .partial() doesn't carry `.default()` values onto PATCH
// (mass-assignment via Zod defaults — a PATCH `{}` body would otherwise reset
// `isActive=true` and `sortOrder=0`, silently undoing a soft-delete).
export const updateBrandSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const brandListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type BrandListQuery = z.infer<typeof brandListQuerySchema>;
