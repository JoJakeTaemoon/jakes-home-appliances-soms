import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

export const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(180),
  address: z.string().trim().min(1).max(255),
  district: optStr(120),
  city: optStr(120),
  region: optStr(60),
  notes: optStr(2000),
});

export const updateSiteSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  address: z.string().trim().min(1).max(255).optional(),
  district: optStr(120),
  city: optStr(120),
  region: optStr(60),
  notes: optStr(2000),
  isActive: z.boolean().optional(),
});

export const deactivateSiteSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
