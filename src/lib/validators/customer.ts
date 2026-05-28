/**
 * Zod schemas for Customer create / update / list endpoints. Shared between
 * the API and the frontend forms.
 *
 * Two variants of create:
 *   - B2C: name + primary contact (phone required), optional 2nd contact.
 *   - B2B: legal name + shortcode (2-5 letters) + tax code + CONTRACT_PARTY
 *          + at least one OPS_CONTACT.
 */

import { z } from "zod";

const localeEnum = z.enum(["ko", "vi", "en"]);

// Lightweight phone validator — accepts Vietnamese formats including +84.
const phoneRegex = /^\+?[0-9\s\-().]{6,20}$/;

/** Optional string: trims, accepts "" → undefined, max length cap. */
function optString(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const contactBase = z.object({
  name: z.string().trim().min(1).max(120),
  title: optString(120),
  phone1: z.string().trim().regex(phoneRegex, "Invalid phone").min(6).max(20),
  phone2: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().regex(phoneRegex).max(20).optional()),
  email: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().email().optional()),
  language: localeEnum.default("vi"),
});

export const contractPartyInputSchema = contactBase.extend({
  role: z.literal("CONTRACT_PARTY").default("CONTRACT_PARTY"),
});

export const opsContactInputSchema = contactBase.extend({
  role: z.literal("OPS_CONTACT").default("OPS_CONTACT"),
  isPrimary: z.boolean().default(false),
});

const addressFields = {
  address: optString(255),
  district: optString(120),
  city: optString(120),
} as const;

const shortcodeRegex = /^[A-Z][A-Z0-9]{1,4}$/;

const createBaseFields = {
  name: z.string().trim().min(1).max(255),
  ...addressFields,
  preferredRegion: optString(60),
  preferredTechnicianId: optString(60),
  notes: optString(2000),
} as const;

export const createB2CCustomerSchema = z.object({
  type: z.literal("B2C"),
  ...createBaseFields,
  contractParty: contractPartyInputSchema,
  opsContacts: z.array(opsContactInputSchema).default([]),
});

export const createB2BCustomerSchema = z.object({
  type: z.literal("B2B"),
  ...createBaseFields,
  shortcode: z
    .string()
    .trim()
    .regex(shortcodeRegex, "Shortcode must be 2-5 chars starting A-Z (A-Z0-9)"),
  taxCode: z.string().trim().min(6).max(40),
  contractParty: contractPartyInputSchema,
  opsContacts: z.array(opsContactInputSchema).min(1, "B2B requires at least one OPS contact"),
});

export const createCustomerSchema = z.discriminatedUnion("type", [
  createB2CCustomerSchema,
  createB2BCustomerSchema,
]);

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  shortcode: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().regex(shortcodeRegex).optional()),
  taxCode: optString(40),
  address: optString(255),
  district: optString(120),
  city: optString(120),
  preferredRegion: optString(60),
  preferredTechnicianId: optString(60),
  notes: optString(2000),
});

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  type: z.enum(["B2C", "B2B"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PROSPECT"]).optional(),
  region: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const deactivateCustomerSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateB2CInput = z.infer<typeof createB2CCustomerSchema>;
export type CreateB2BInput = z.infer<typeof createB2BCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type DeactivateCustomerInput = z.infer<typeof deactivateCustomerSchema>;
