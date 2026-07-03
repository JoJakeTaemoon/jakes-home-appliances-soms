/**
 * GET /api/customers/[id]/stats — KPI strip data for the customer detail page.
 * Returns:
 *   - totalEquipment + activeEquipment + inactiveEquipment breakdown
 *   - totalContracts + activeContracts + closedContracts breakdown
 *   - monthlyMaintenanceRevenue + monthlyRentalRevenue (sum of equipment fees)
 *   - totalReceivable (sum of expected - actual on EXPECTED/PARTIAL payments)
 */

import prisma from "@/lib/prisma";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { canViewCustomer } from "@/lib/customers/access";
import { successResponse, toErrorResponse } from "@/lib/api/response";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    if (!canViewCustomer(auth.role)) {
      throw new ForbiddenError("Cannot view customer stats");
    }
    const { id } = await context.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    const [equipmentGroups, contractGroups, equipmentForRevenue, payments] =
      await Promise.all([
        prisma.equipment.groupBy({
          by: ["lifecycleStage"],
          where: { customerId: id },
          _count: { _all: true },
        }),
        prisma.contract.groupBy({
          by: ["state"],
          where: { customerId: id },
          _count: { _all: true },
        }),
        prisma.equipment.findMany({
          where: {
            customerId: id,
            lifecycleStage: { in: ["IN_RENTAL", "IN_MAINTENANCE", "INSTALLED"] },
          },
          select: { serviceType: true, monthlyFee: true, lifecycleStage: true },
        }),
        prisma.payment.findMany({
          where: {
            customerId: id,
            state: { in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"] },
          },
          select: { expectedAmount: true, actualAmount: true },
        }),
      ]);

    let totalEquipment = 0;
    let activeEquipment = 0;
    let inactiveEquipment = 0;
    for (const g of equipmentGroups) {
      totalEquipment += g._count._all;
      if (["INSTALLED", "IN_RENTAL", "IN_MAINTENANCE"].includes(g.lifecycleStage)) {
        activeEquipment += g._count._all;
      } else {
        inactiveEquipment += g._count._all;
      }
    }

    let totalContracts = 0;
    let activeContracts = 0;
    let closedContracts = 0;
    for (const g of contractGroups) {
      totalContracts += g._count._all;
      if (["ACTIVE", "AMENDED"].includes(g.state)) {
        activeContracts += g._count._all;
      } else if (["COMPLETED", "TERMINATED", "CANCELLED"].includes(g.state)) {
        closedContracts += g._count._all;
      }
    }

    let monthlyMaintenanceRevenue = 0;
    let monthlyRentalRevenue = 0;
    for (const eq of equipmentForRevenue) {
      const fee = Number(eq.monthlyFee ?? 0);
      if (eq.serviceType === "RENTAL") {
        monthlyRentalRevenue += fee;
      } else if (eq.serviceType === "MAINTENANCE") {
        monthlyMaintenanceRevenue += fee;
      }
    }

    let totalReceivable = 0;
    for (const p of payments) {
      const expected = Number(p.expectedAmount ?? 0);
      const actual = Number(p.actualAmount ?? 0);
      totalReceivable += Math.max(0, expected - actual);
    }

    return successResponse({
      totalEquipment,
      activeEquipment,
      inactiveEquipment,
      totalContracts,
      activeContracts,
      closedContracts,
      monthlyMaintenanceRevenue,
      monthlyRentalRevenue,
      totalReceivable,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
