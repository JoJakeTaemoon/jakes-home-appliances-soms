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

/** Self-service password change — office + field realms (same rule as the portal). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(256),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
