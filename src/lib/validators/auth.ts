/**
 * Zod schemas for authentication endpoints. Shared between API routes and
 * frontend forms so validation is identical on both sides.
 */

import { z } from "zod";

/**
 * Login accepts either a username (office staff) or a phone (technicians).
 * The legacy `username` field is preserved as the canonical key — the API
 * accepts both forms (`{ username }` and `{ phone, password }`) and the
 * route handler resolves them to a User.
 */
export const loginSchema = z
  .object({
    username: z.string().trim().min(1).max(64).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    password: z.string().min(1, "Password is required").max(256),
  })
  .refine((d) => !!d.username || !!d.phone, {
    message: "username or phone is required",
    path: ["username"],
  });
export type LoginInput = z.infer<typeof loginSchema>;
