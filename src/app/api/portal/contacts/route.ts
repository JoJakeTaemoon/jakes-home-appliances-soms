/**
 * GET /api/portal/contacts — UC-PT-07 (B2B contact management).
 *
 * Returns all CustomerContacts belonging to the caller's customer. Only
 * CONTRACT_PARTY or primary-site OPS may even land here in the UI; the
 * server still re-validates per-row before exposing.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);

    // Only CONTRACT_PARTY (or primary-site OPS) sees the contact roster.
    if (caller.role !== "CONTRACT_PARTY") {
      // We could allow primary OPS to see same-site contacts; check the
      // caller's primary flag against the DB.
      const me = await prisma.customerContact.findUnique({
        where: { id: caller.contactId },
        select: { isPrimary: true, scope: true, siteId: true },
      });
      if (!me?.isPrimary || me.scope !== "SITE" || !me.siteId) {
        throw new ForbiddenError("Not permitted to list contacts");
      }
    }

    const contacts = await prisma.customerContact.findMany({
      where: { customerId: caller.customerId },
      include: {
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return successResponse({
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        phone1: c.phone1,
        email: c.email,
        language: c.language,
        role: c.role,
        scope: c.scope,
        isPrimary: c.isPrimary,
        site: c.site,
        portalEnabled: c.portalEnabled,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
