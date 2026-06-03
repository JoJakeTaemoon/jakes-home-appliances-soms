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

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canViewEquipmentAtSite } from "@/lib/auth/customer-access";

export const GET = defineQuery({
  audience: "customer",
  handler: async ({ auth }) => {
    const equipment = await prisma.equipment.findMany({
      where: { customerId: auth.customerId },
      include: {
        model: {
          select: {
            id: true,
            modelCode: true,
            nameKo: true,
            nameVi: true,
            nameEn: true,
            category: true,
            filterPolicy: true,
            // ConsumableOnModel join — needed so the customer dashboard
            // can compute the next filter-replacement due date when no
            // FILTER_REPLACEMENT visit has been scheduled yet. The
            // model.filterPolicy JSON is a legacy field and is empty
            // for most seeded models; the Consumable table is the
            // canonical source of replacement cycles.
            consumables: {
              select: {
                quantity: true,
                consumable: {
                  select: {
                    id: true,
                    sku: true,
                    nameKo: true,
                    nameVi: true,
                    nameEn: true,
                    replaceEveryMonths: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
        site: { select: { id: true, name: true } },
      },
      orderBy: { installedAt: "desc" },
    });

    const visible = equipment.filter((eq) =>
      canViewEquipmentAtSite(
        {
          contactId: auth.contactId,
          customerId: auth.customerId,
          role: auth.role,
          scope: auth.scope,
          siteId: auth.siteId,
        },
        eq.siteId,
      ),
    );

    return {
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
    };
  },
});
