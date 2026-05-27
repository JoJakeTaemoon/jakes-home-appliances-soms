/**
 * GET /api/portal/equipment — UC-PT-02.
 *
 * Returns the logged-in customer's equipment. SITE-scoped OPS see only their
 * site's equipment (plus equipment with no site, e.g. B2C); CUSTOMER-scoped
 * and CONTRACT_PARTY see everything across the customer.
 *
 * Response groups by Site for B2B so the UI can render collapsible sections;
 * B2C customers receive a single ungrouped list (siteId is null on B2C
 * equipment).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { canViewEquipmentAtSite } from "@/lib/auth/customer-access";
import { successResponse, toErrorResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);

    const equipment = await prisma.equipment.findMany({
      where: { customerId: caller.customerId },
      include: {
        model: {
          select: {
            id: true,
            modelCode: true,
            name: true,
            category: true,
            filterPolicy: true,
          },
        },
        site: { select: { id: true, name: true } },
      },
      orderBy: { installedAt: "desc" },
    });

    // Apply site-scope filter for SITE-scoped OPS contacts.
    const visible = equipment.filter((eq) =>
      canViewEquipmentAtSite(
        {
          contactId: caller.contactId,
          customerId: caller.customerId,
          role: caller.role,
          scope: caller.scope,
          siteId: caller.siteId,
        },
        eq.siteId,
      ),
    );

    return successResponse({
      equipment: visible.map((eq) => ({
        id: eq.id,
        serialNumber: eq.serialNumber,
        status: eq.status,
        ownership: eq.ownership,
        installedAt: eq.installedAt,
        model: eq.model,
        site: eq.site,
        filterPolicyOverride: eq.filterPolicyOverride,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
