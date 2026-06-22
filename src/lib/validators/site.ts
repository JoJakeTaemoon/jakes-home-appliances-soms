import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const structuredAddressFields = {
  addressProvinceCode: optStr(20),
  addressProvinceName: optStr(120),
  addressDistrictCode: optStr(20),
  addressDistrictName: optStr(120),
  addressWardCode: optStr(20),
  addressWardName: optStr(120),
  addressStreet: optStr(255),
} as const;

export const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(180),
  ...structuredAddressFields,
  region: optStr(60),
  notes: optStr(2000),
});

export const updateSiteSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  ...structuredAddressFields,
  region: optStr(60),
  notes: optStr(2000),
  isActive: z.boolean().optional(),
});

export const deactivateSiteSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
