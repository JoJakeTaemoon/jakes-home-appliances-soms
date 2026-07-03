/**
 * GET /api/sales-reps — list office users that can be designated as a
 * customer's sales rep. Used by:
 *   - the customer-list sidebar filter (Combobox)
 *   - the change-sales-rep modal in customer-detail
 *   - the sales-rep landing page (/o/sales-reps)
 *
 * Policy (2026-06-26): every active office user (ADMIN / MANAGER /
 * STAFF) is a candidate. TECHNICIAN is excluded — they're field
 * technicians, never the customer's sales contact. The legacy
 * `User.isSalesRep` toggle is ignored here so the picker reflects the
 * full office roster automatically.
 *
 * Each row carries a `stats` block (this-month counts + receivables)
 * so the landing page can render numeric cards without N round-trips.
 * Computed in a single groupBy per metric.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { z } from "zod";

export const GET = defineQuery({
  audience: "staff",
  authorize: () => {
    /* All staff can read the sales-rep roster (used in filters). */
  },
  query: z.object({}),
  handler: async () => {
    const reps = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "MANAGER", "STAFF"] },
        status: "ACTIVE",
      },
      select: {
        id: true,
        username: true,
        title: true,
        avatarUrl: true,
        role: true,
      },
      orderBy: { username: "asc" },
    });
    if (reps.length === 0) return [];

    const repIds = reps.map((r) => r.id);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // ── Customer count per rep ──
    const customerGroups = await prisma.customer.groupBy({
      by: ["salesRepId"],
      where: { salesRepId: { in: repIds } },
      _count: { _all: true },
    });
    const customersByRep = new Map<string, number>();
    for (const g of customerGroups) {
      if (g.salesRepId) customersByRep.set(g.salesRepId, g._count._all);
    }

    // ── This-month new equipment + revenue per rep ──
    // Equipment-centric aggregation (2026-07-02 policy) — the rep's
    // numbers roll up from devices installed this month for their
    // assigned customers. "monthlyContracts" name is kept on the
    // response for backward compat with the sales-rep list card
    // markup, but it now counts equipment.
    const monthlyEquipment = await prisma.equipment.findMany({
      where: {
        installedAt: { gte: monthStart },
        status: { not: "REPLACED" },
        customer: { salesRepId: { in: repIds } },
      },
      select: {
        deposit: true,
        monthlyFee: true,
        customer: { select: { salesRepId: true } },
      },
    });
    const monthlyCountByRep = new Map<string, number>();
    const monthlyRevenueByRep = new Map<string, number>();
    /** First-year book value per install: deposit + 12 recurring months. */
    const REVENUE_MONTHS = 12;
    for (const eq of monthlyEquipment) {
      const repId = eq.customer.salesRepId;
      if (!repId) continue;
      monthlyCountByRep.set(repId, (monthlyCountByRep.get(repId) ?? 0) + 1);
      const revenue =
        Number(eq.deposit ?? 0) + Number(eq.monthlyFee ?? 0) * REVENUE_MONTHS;
      monthlyRevenueByRep.set(
        repId,
        (monthlyRevenueByRep.get(repId) ?? 0) + revenue,
      );
    }

    // ── Outstanding receivables per rep ──
    const payments = await prisma.payment.findMany({
      where: {
        state: { in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"] },
        customer: { salesRepId: { in: repIds } },
      },
      select: {
        expectedAmount: true,
        actualAmount: true,
        customer: { select: { salesRepId: true } },
      },
    });
    const receivablesByRep = new Map<string, number>();
    for (const p of payments) {
      const repId = p.customer.salesRepId;
      if (!repId) continue;
      const outstanding = Math.max(
        0,
        Number(p.expectedAmount ?? 0) - Number(p.actualAmount ?? 0),
      );
      receivablesByRep.set(
        repId,
        (receivablesByRep.get(repId) ?? 0) + outstanding,
      );
    }

    return reps.map((r) => ({
      ...r,
      stats: {
        customerCount: customersByRep.get(r.id) ?? 0,
        monthlyContracts: monthlyCountByRep.get(r.id) ?? 0,
        monthlyRevenue: monthlyRevenueByRep.get(r.id) ?? 0,
        receivables: receivablesByRep.get(r.id) ?? 0,
      },
    }));
  },
});
