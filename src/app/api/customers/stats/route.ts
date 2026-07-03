/**
 * GET /api/customers/stats — aggregate KPI counts for the customer list page.
 * Returns: totalCustomers, activeCustomers, b2bCount, b2cCount, totalEquipment,
 * totalContracts.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canViewCustomer } from "@/lib/customers/access";
import { ForbiddenError } from "@/lib/api/error";
import { z } from "zod";

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewCustomer(auth.role)) {
      throw new ForbiddenError("Cannot view customer stats");
    }
  },
  query: z.object({}),
  handler: async () => {
    const [
      totalCustomers,
      activeCustomers,
      b2bCount,
      b2cCount,
      totalEquipment,
      totalContracts,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { status: "ACTIVE" } }),
      prisma.customer.count({ where: { type: "B2B" } }),
      prisma.customer.count({ where: { type: "B2C" } }),
      prisma.equipment.count({
        where: {
          status: { not: "REPLACED" },
          lifecycleStage: { in: ["INSTALLED", "IN_RENTAL", "IN_MAINTENANCE"] },
        },
      }),
      prisma.contract.count({ where: { state: { in: ["ACTIVE", "AMENDED"] } } }),
    ]);

    return {
      totalCustomers,
      activeCustomers,
      b2bCount,
      b2cCount,
      totalEquipment,
      totalContracts,
    };
  },
});
