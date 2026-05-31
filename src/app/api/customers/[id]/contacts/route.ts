/**
 * POST /api/customers/[id]/contacts — add CustomerContact.
 *
 * Enforces:
 *   - exactly one CONTRACT_PARTY per customer (rejects a 2nd one)
 *   - exactly one primary OPS_CONTACT per scope (CUSTOMER or per SITE)
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { canManageContact } from "@/lib/customers/access";
import { createContactSchema } from "@/lib/validators/customerContact";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/api/error";
import { enablePortalAccount } from "@/lib/auth/portal-enable";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageContact(auth.role))
      throw new ForbiddenError("Cannot manage contacts");
  },
  params: paramsSchema,
  body: createContactSchema,
  successStatus: 201,
  handler: async ({ auth, body, params }) => {
    const customerId = params.id;
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    if (body.scope === "SITE" && body.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: body.siteId, customerId },
        select: { id: true },
      });
      if (!site) throw new NotFoundError("Site not found for customer");
    }

    if (body.role === "CONTRACT_PARTY") {
      const existing = await prisma.customerContact.findFirst({
        where: { customerId, role: "CONTRACT_PARTY" },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError("Customer already has a CONTRACT_PARTY contact");
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      if (body.role === "OPS_CONTACT" && body.isPrimary) {
        await tx.customerContact.updateMany({
          where:
            body.scope === "SITE"
              ? {
                  customerId,
                  siteId: body.siteId,
                  role: "OPS_CONTACT",
                  isPrimary: true,
                }
              : {
                  customerId,
                  scope: "CUSTOMER",
                  role: "OPS_CONTACT",
                  isPrimary: true,
                },
          data: { isPrimary: false },
        });
      }
      // Accounting flag is unique per customer (DB-enforced); demote any
      // prior holder before we set it on the new row.
      if (body.isAccountingContact) {
        await tx.customerContact.updateMany({
          where: { customerId, isAccountingContact: true },
          data: { isAccountingContact: false },
        });
      }
      return tx.customerContact.create({
        data: {
          customerId,
          siteId: body.scope === "SITE" ? body.siteId ?? null : null,
          role: body.role,
          scope: body.scope,
          isPrimary: body.role === "OPS_CONTACT" ? body.isPrimary : false,
          isAccountingContact: body.isAccountingContact,
          name: body.name,
          title: body.title ?? null,
          phone1: body.phone1,
          phone2: body.phone2 ?? null,
          email: body.email ?? null,
          language: body.language,
        },
      });
    });

    if (body.portalEnabled && created.phone1) {
      try {
        await enablePortalAccount({
          contactId: created.id,
          actorId: auth.userId,
          actorType: "USER",
        });
      } catch (portalErr) {
        console.error(
          `[contacts] Failed to enable portal for ${created.id}: ${portalErr}`,
        );
      }
    }

    return created;
  },
  audit: {
    action: "CUSTOMER_CONTACT_CREATE",
    entityType: "CustomerContact",
    after: (r) => r,
  },
});
