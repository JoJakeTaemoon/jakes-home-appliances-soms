/**
 * Server-side auth guards for the customer portal.
 *
 * Mirrors `src/lib/auth/guards.ts` but reads `customerAccessToken` and
 * verifies with `aud='customer'`. Returns a hydrated `AuthenticatedCustomer`
 * payload — call sites get the contact id + customer id + role + scope + site.
 *
 * Token sources:
 *   - Authorization: Bearer <jwt> (client fetch calls)
 *   - customerAccessToken cookie    (SSR / Server Actions)
 */

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyAccessToken, type CustomerJwtPayload } from "@/lib/auth/jwt";
import { UnauthorizedError, ForbiddenError } from "@/lib/api/error";
import { CUSTOMER_ACCESS_COOKIE } from "@/lib/auth/customer-cookies";
import type { ContactRole, ContactScope, Locale } from "@/generated/prisma/client";

export interface AuthenticatedCustomer extends CustomerJwtPayload {
  contactId: string; // alias of sub
  customerId: string;
  customerCode: string;
  customerName: string;
  customerType: "B2C" | "B2B";
  name: string;
  phone1: string;
  email: string | null;
  language: Locale;
  role: ContactRole; // CONTRACT_PARTY | OPS_CONTACT
  scope: ContactScope;
  siteId: string | null;
  mustChangePassword: boolean;
  portalEnabled: boolean;
  smsOptOut: boolean;
  emailOptOut: boolean;
}

function getAccessTokenFromRequest(request?: NextRequest): string | null {
  if (request) {
    const auth = request.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const tok = auth.slice(7).trim();
      if (tok) return tok;
    }
    const cookie = request.cookies.get(CUSTOMER_ACCESS_COOKIE)?.value;
    if (cookie) return cookie;
  }
  return null;
}

async function getAccessTokenFromCookieStore(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(CUSTOMER_ACCESS_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export async function requireCustomerAuth(
  request?: NextRequest,
): Promise<AuthenticatedCustomer> {
  let token = getAccessTokenFromRequest(request);
  if (!token) token = await getAccessTokenFromCookieStore();
  if (!token) throw new UnauthorizedError("Missing customer access token");

  let payload: CustomerJwtPayload;
  try {
    payload = await verifyAccessToken(token, "customer");
  } catch {
    throw new UnauthorizedError("Invalid or expired customer access token");
  }

  const contact = await prisma.customerContact.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      customerId: true,
      role: true,
      scope: true,
      siteId: true,
      name: true,
      phone1: true,
      email: true,
      language: true,
      portalEnabled: true,
      mustChangePassword: true,
      smsOptOut: true,
      emailOptOut: true,
      customer: {
        select: { id: true, code: true, name: true, type: true },
      },
    },
  });
  if (!contact || !contact.portalEnabled) {
    throw new UnauthorizedError("Portal account not found or disabled");
  }

  return {
    ...payload,
    contactId: contact.id,
    customerId: contact.customerId,
    customerCode: contact.customer.code,
    customerName: contact.customer.name,
    customerType: contact.customer.type,
    name: contact.name,
    phone1: contact.phone1,
    email: contact.email ?? null,
    language: contact.language,
    role: contact.role,
    scope: contact.scope,
    siteId: contact.siteId ?? null,
    mustChangePassword: contact.mustChangePassword,
    portalEnabled: contact.portalEnabled,
    smsOptOut: contact.smsOptOut,
    emailOptOut: contact.emailOptOut,
  };
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
