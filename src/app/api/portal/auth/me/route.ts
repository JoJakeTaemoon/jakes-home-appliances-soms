/**
 * GET /api/portal/auth/me
 *
 * Returns the currently logged-in CustomerContact. Same envelope shape as the
 * staff `/api/auth/me` endpoint but reads customer audience tokens.
 */

import { defineQuery } from "@/lib/api/mutation";

export const GET = defineQuery({
  audience: "customer",
  handler: async ({ auth }) => ({
    contact: {
      id: auth.contactId,
      customerId: auth.customerId,
      customerCode: auth.customerCode,
      customerName: auth.customerName,
      customerType: auth.customerType,
      name: auth.name,
      phone1: auth.phone1,
      email: auth.email,
      language: auth.language,
      role: auth.role,
      scope: auth.scope,
      siteId: auth.siteId,
      mustChangePassword: auth.mustChangePassword,
      smsOptOut: auth.smsOptOut,
      emailOptOut: auth.emailOptOut,
    },
  }),
});
