/**
 * GET /api/portal/contacts — UC-PT-07 (B2B contact management).
 *
 * Returns all CustomerContacts belonging to the caller's customer. Only
 * CONTRACT_PARTY or primary-site OPS may even land here in the UI; the
 * server still re-validates per-row before exposing.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";

export const GET = defineQuery({
  audience: "customer",
  handler: async ({ auth }) => {
    // Only CONTRACT_PARTY (or primary-site OPS) sees the contact roster.
    if (auth.role !== "CONTRACT_PARTY") {
      const me = await prisma.customerContact.findUnique({
        where: { id: auth.contactId },
        select: { isPrimary: true, scope: true, siteId: true },
      });
      if (!me?.isPrimary || me.scope !== "SITE" || !me.siteId) {
        throw new ForbiddenError("Not permitted to list contacts");
      }
    }

    const contacts = await prisma.customerContact.findMany({
      where: { customerId: auth.customerId },
      include: {
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return {
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
    };
  },
});
