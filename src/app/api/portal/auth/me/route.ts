/**
 * GET /api/portal/auth/me
 *
 * Returns the currently logged-in CustomerContact. Same envelope shape as the
 * staff `/api/auth/me` endpoint but reads customer audience tokens.
 */

import { NextRequest } from "next/server";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);
    return successResponse({
      contact: {
        id: caller.contactId,
        customerId: caller.customerId,
        customerCode: caller.customerCode,
        customerName: caller.customerName,
        customerType: caller.customerType,
        name: caller.name,
        phone1: caller.phone1,
        email: caller.email,
        language: caller.language,
        role: caller.role,
        scope: caller.scope,
        siteId: caller.siteId,
        mustChangePassword: caller.mustChangePassword,
        smsOptOut: caller.smsOptOut,
        emailOptOut: caller.emailOptOut,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
