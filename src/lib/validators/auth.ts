/**
 * Zod schemas for authentication endpoints. Shared between API routes and
 * frontend forms so validation is identical on both sides.
 */

import { z } from "zod";

/**
 * Login by phone (the canonical staff key id since 2026-05-28).
 *
 * The legacy `username` field is still accepted by the API for back-compat
 * with older integration tests / dev scripts, but new UI submits `phone`.
 */
export const loginSchema = z
  .object({
    username: z.string().trim().min(1).max(64).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    password: z.string().min(1, "Password is required").max(256),
  })
  .refine((d) => !!d.username || !!d.phone, {
    message: "phone is required",
    path: ["phone"],
  });
export type LoginInput = z.infer<typeof loginSchema>;

/** POST /api/auth/password-reset/request — { phone, locale }. */
export const passwordResetRequestSchema = z.object({
  phone: z.string().trim().min(4).max(40),
  /** UI locale of the requester — drives the SMS body's language. */
  locale: z.enum(["vi", "ko", "en"]).optional(),
});
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

/** POST /api/auth/password-reset/verify — { phone, code }. */
export const passwordResetVerifySchema = z.object({
  phone: z.string().trim().min(4).max(40),
  code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
});
export type PasswordResetVerifyInput = z.infer<
  typeof passwordResetVerifySchema
>;
