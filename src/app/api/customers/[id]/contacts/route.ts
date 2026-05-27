/**
 * POST /api/customers/[id]/contacts — add CustomerContact.
 *
 * Enforces:
 *   - exactly one CONTRACT_PARTY per customer (rejects a 2nd one)
 *   - exactly one primary OPS_CONTACT per scope (CUSTOMER or per SITE)
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageContact } from "@/lib/customers/access";
import { createContactSchema } from "@/lib/validators/customerContact";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { enablePortalAccount } from "@/lib/auth/portal-enable";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!canManageContact(auth.role)) throw new ForbiddenError("Cannot manage contacts");
    const { id: customerId } = await ctx.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    const body = await request.json().catch(() => null);
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid contact payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    // Validate site belongs to this customer when scope=SITE.
    if (data.scope === "SITE" && data.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: data.siteId, customerId },
        select: { id: true },
      });
      if (!site) throw new NotFoundError("Site not found for customer");
    }

    // Refuse a 2nd CONTRACT_PARTY.
    if (data.role === "CONTRACT_PARTY") {
      const existing = await prisma.customerContact.findFirst({
        where: { customerId, role: "CONTRACT_PARTY" },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError("Customer already has a CONTRACT_PARTY contact");
      }
    }

    // Handle primary OPS toggle: if marking primary, demote others in scope.
    const created = await prisma.$transaction(async (tx) => {
      if (data.role === "OPS_CONTACT" && data.isPrimary) {
        await tx.customerContact.updateMany({
          where:
            data.scope === "SITE"
              ? { customerId, siteId: data.siteId, role: "OPS_CONTACT", isPrimary: true }
              : { customerId, scope: "CUSTOMER", role: "OPS_CONTACT", isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.customerContact.create({
        data: {
          customerId,
          siteId: data.scope === "SITE" ? data.siteId ?? null : null,
          role: data.role,
          scope: data.scope,
          isPrimary: data.role === "OPS_CONTACT" ? data.isPrimary : false,
          name: data.name,
          title: data.title ?? null,
          phone1: data.phone1,
          phone2: data.phone2 ?? null,
          email: data.email ?? null,
          language: data.language,
        },
      });
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CUSTOMER_CONTACT_CREATE",
      entityType: "CustomerContact",
      entityId: created.id,
      after: created,
      request,
    });

    // If the staff member ticked "enable portal" on creation, provision the
    // portal account inline. Failure here logs but does not roll back the
    // contact (portal can be enabled later via the dedicated endpoint).
    if (data.portalEnabled && created.phone1) {
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

    return successResponse(created, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
