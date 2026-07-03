/**
 * GET /api/equipment/[id]/payments
 *
 * Per-equipment cash collection ledger. Returns every Payment row tied
 * to this Equipment (`Payment.equipmentId`) PLUS aggregates grouped by
 * kind + state so the equipment-detail "수금 내역" section can render
 * headline totals without doing the math client-side.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot view equipment");
    }
  },
  params: paramsSchema,
  handler: async ({ params }) => {
    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!equipment) throw new NotFoundError("Equipment not found");

    const rows = await prisma.payment.findMany({
      where: { equipmentId: params.id },
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
      include: {
        collectedBy: { select: { id: true, username: true } },
        visit: { select: { id: true, type: true, scheduledFor: true } },
        contract: {
          select: { id: true, contractNumber: true, type: true },
        },
      },
    });

    const totalsByKind: Record<string, number> = {};
    const countsByState: Record<string, number> = {};
    for (const r of rows) {
      totalsByKind[r.kind] = (totalsByKind[r.kind] ?? 0) + Number(r.actualAmount);
      countsByState[r.state] = (countsByState[r.state] ?? 0) + 1;
    }

    return {
      rows,
      totals: { byKind: totalsByKind, byState: countsByState },
    };
  },
});
