/**
 * GET /api/customers/:id/data-checks
 *
 * What staff should look at on this customer — mostly left behind by the data
 * migration, but the rules hold for any customer:
 *   - opsToReview: operations contacts the system filled in (`needsReview`).
 *   - contractsWithoutFee: live rental/maintenance contracts the monthly
 *     billing job skips because they have no amount.
 *   - equipmentWithoutFilterDate: active units with a filter that has gone a
 *     whole cycle since installation with no change recorded — its due date
 *     is only a guess from the install date. A new install is not listed:
 *     its filter is new, so the install date is the real change date.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canViewCustomer } from "@/lib/customers/access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { addDays } from "@/lib/contracts/pause-period";
import { monthlyBillingAmount } from "@/lib/payments/billing";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewCustomer(auth.role)) throw new ForbiddenError("Cannot view customers");
  },
  params: paramsSchema,
  handler: async ({ params }) => {
    const now = new Date();
    const customerId = params.id;
    const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!exists) throw new NotFoundError("Customer not found");

    const [opsToReview, contracts, equipment, changes] = await Promise.all([
      prisma.customerContact.findMany({
        where: { customerId, needsReview: true },
        select: { id: true, name: true },
      }),
      // Same population the recurring-payment job bills.
      prisma.contract.findMany({
        where: {
          customerId,
          state: "ACTIVE",
          type: { in: ["RENTAL", "MAINTENANCE"] },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        select: {
          id: true,
          contractNumber: true,
          type: true,
          monthlyMaintenanceFee: true,
          equipment: { select: { unitPrice: true, quantity: true } },
        },
      }),
      prisma.equipment.findMany({
        where: { customerId, status: "ACTIVE", installedAt: { not: null } },
        select: {
          id: true,
          assetCode: true,
          installedAt: true,
          model: { select: { modelCode: true } },
          consumables: {
            // A pinned last or next date means staff already settled it.
            where: {
              consumableId: { not: null },
              excluded: false,
              lastReplacedAtOverride: null,
              nextReplaceAtOverride: null,
            },
            select: {
              consumableId: true,
              replaceEveryDays: true,
              consumable: { select: { replaceEveryDays: true } },
            },
          },
        },
      }),
      prisma.visitConsumableLog.findMany({
        where: { action: "REPLACE", visit: { customerId } },
        select: { consumableId: true, visit: { select: { equipmentId: true } } },
      }),
    ]);

    const changed = new Set(changes.map((l) => `${l.visit.equipmentId}|${l.consumableId}`));

    return {
      opsToReview,
      contractsWithoutFee: contracts
        .filter((c) => monthlyBillingAmount(c) <= 0)
        .map(({ id, contractNumber }) => ({ id, contractNumber })),
      equipmentWithoutFilterDate: equipment
        .filter((e) =>
          e.consumables.some((c) => {
            const cycle = c.replaceEveryDays ?? c.consumable?.replaceEveryDays ?? null;
            return (
              cycle !== null &&
              !changed.has(`${e.id}|${c.consumableId}`) &&
              addDays(e.installedAt!, cycle) < now
            );
          }),
        )
        .map((e) => ({ id: e.id, assetCode: e.assetCode, modelCode: e.model?.modelCode ?? null })),
    };
  },
});
