/**
 * Zod schemas for portal (CustomerContact) authentication endpoints. Shared
 * between API routes and frontend forms so the contract is identical on
 * both sides.
 */

import { z } from "zod";

const phoneRegex = /^\+?[0-9\s\-().]{6,20}$/;

export const portalLoginSchema = z.object({
  phone: z.string().trim().regex(phoneRegex).min(6).max(20),
  password: z.string().min(1, "Password is required").max(256),
  /** Disambiguates when multiple CustomerContacts share the same phone (A.13). */
  contactId: z.string().trim().min(1).max(60).optional(),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

export const portalForgotPasswordSchema = z.object({
  phone: z.string().trim().regex(phoneRegex).min(6).max(20),
  /** Name match guards against random phone enumeration. */
  name: z.string().trim().min(1).max(120),
});
export type PortalForgotPasswordInput = z.infer<typeof portalForgotPasswordSchema>;

export const portalChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(256),
});
export type PortalChangePasswordInput = z.infer<typeof portalChangePasswordSchema>;

export const portalUpdateOwnContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z
    .preprocess((v) => {
      if (typeof v !== "string") return v;
      const t = v.trim();
      return t === "" ? null : t;
    }, z.union([z.string().email(), z.null()]))
    .optional(),
  language: z.enum(["ko", "vi", "en"]).optional(),
  smsOptOut: z.boolean().optional(),
  emailOptOut: z.boolean().optional(),
});
export type PortalUpdateOwnContactInput = z.infer<typeof portalUpdateOwnContactSchema>;
