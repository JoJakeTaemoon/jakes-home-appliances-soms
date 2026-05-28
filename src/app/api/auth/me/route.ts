/**
 * GET /api/auth/me
 *
 * Returns the current authenticated staff user. Uses the access token from
 * either the Authorization: Bearer header (client fetch calls) or the
 * accessToken cookie (server components / form submissions).
 */

import { defineQuery } from "@/lib/api/mutation";

export const GET = defineQuery({
  audience: "staff",
  handler: async ({ auth }) => ({
    user: {
      id: auth.userId,
      username: auth.username,
      email: auth.email,
      phone: auth.phone,
      role: auth.role,
      mustChangePassword: auth.mustChangePassword,
    },
  }),
});
