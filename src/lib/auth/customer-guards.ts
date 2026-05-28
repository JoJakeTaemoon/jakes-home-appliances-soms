/**
 * Customer (portal) guards — thin facade over `core/guards` bound to
 * `customerRealm`. Preserves the historical surface (`requireCustomerAuth`,
 * `requireContractParty`, `AuthenticatedCustomer`).
 */

import type { NextRequest } from "next/server";
import { ForbiddenError } from "@/lib/api/error";
import { requireAuth as coreRequireAuth } from "@/lib/auth/core/guards";
import {
  customerRealm,
  type AuthenticatedCustomer,
} from "@/lib/auth/realms/customer-realm";

export type { AuthenticatedCustomer };

export async function requireCustomerAuth(
  request?: NextRequest,
): Promise<AuthenticatedCustomer> {
  return coreRequireAuth(customerRealm, request);
}

/** Require CONTRACT_PARTY role specifically (e.g. contact management). */
export async function requireContractParty(
  request?: NextRequest,
): Promise<AuthenticatedCustomer> {
  const caller = await requireCustomerAuth(request);
  if (caller.role !== "CONTRACT_PARTY") {
    throw new ForbiddenError("CONTRACT_PARTY role required");
  }
  return caller;
}
