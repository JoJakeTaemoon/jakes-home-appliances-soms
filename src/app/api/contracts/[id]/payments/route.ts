/**
 * GET /api/contracts/[id]/payments
 *
 * Returns every Payment row attached to the contract, plus aggregates
 * grouped by kind + state so the detail page can render the headline
 * chips (보증금 1,500,000 · 임대료 누적 12,000,000 …) without doing the
 * math client-side.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { canViewContract } from "@/lib/contracts/access";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewContract(auth.role))
      throw new ForbiddenError("Cannot view contracts");
  },
  params: paramsSchema,
  handler: async ({ params }) => {
    const contract = await prisma.contract.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!contract) throw new NotFoundError("Contract not found");

    const rows = await prisma.payment.findMany({
      where: { contractId: params.id },
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
      include: {
        collectedBy: { select: { id: true, username: true } },
        visit: {
          select: { id: true, type: true, scheduledFor: true },
        },
      },
    });

    // Aggregate by kind (totals) and by state (counts) so the header chips
    // and the per-state filter don't require a second round-trip.
    const totalsByKind: Record<string, number> = {};
    const countsByState: Record<string, number> = {};
    for (const r of rows) {
      const k = r.kind;
      totalsByKind[k] = (totalsByKind[k] ?? 0) + Number(r.actualAmount);
      const s = r.state;
      countsByState[s] = (countsByState[s] ?? 0) + 1;
    }

    return {
      rows,
      totals: { byKind: totalsByKind, byState: countsByState },
    };
  },
});
