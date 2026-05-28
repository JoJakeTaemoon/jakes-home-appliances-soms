/**
 * Technician productivity report (UC-RP-03).
 *
 * For each TECHNICIAN with at least one completed Visit in the requested
 * window:
 *   - visitsCompleted    — count of state=COMPLETED visits as lead
 *   - avgDurationMinutes — average (completedAt − startedAt) where both set
 *   - lateHandoversCount — count of own COLLECTED payments held > 48h
 *                          before being HANDED_OVER (oldest cash check)
 */

import prisma from "@/lib/prisma";

export interface TechnicianProductivityRow {
  techId: string;
  name: string;
  visitsCompleted: number;
  avgDurationMinutes: number | null;
  lateHandoversCount: number;
}

const HANDOVER_SLA_MS = 48 * 60 * 60 * 1000;

export async function getTechnicianProductivity(input: {
  start: Date;
  end: Date;
}): Promise<TechnicianProductivityRow[]> {
  // 1) Completed visits as lead, in window.
  const visits = await prisma.visit.findMany({
    where: {
      state: "COMPLETED",
      completedAt: { gte: input.start, lte: input.end },
      leadTechnicianId: { not: null },
    },
    select: {
      leadTechnicianId: true,
      startedAt: true,
      completedAt: true,
      leadTechnician: { select: { id: true, username: true } },
    },
  });

  const map = new Map<
    string,
    {
      techId: string;
      name: string;
      visitsCompleted: number;
      durationMsSum: number;
      durationMsCount: number;
      lateHandoversCount: number;
    }
  >();
  for (const v of visits) {
    if (!v.leadTechnician) continue;
    const row = map.get(v.leadTechnician.id) ?? {
      techId: v.leadTechnician.id,
      name: v.leadTechnician.username,
      visitsCompleted: 0,
      durationMsSum: 0,
      durationMsCount: 0,
      lateHandoversCount: 0,
    };
    row.visitsCompleted += 1;
    if (v.startedAt && v.completedAt) {
      row.durationMsSum += v.completedAt.getTime() - v.startedAt.getTime();
      row.durationMsCount += 1;
    }
    map.set(v.leadTechnician.id, row);
  }

  // 2) Late handovers (window scoped to collectedAt).
  const payments = await prisma.payment.findMany({
    where: {
      state: { in: ["HANDED_OVER", "RECONCILED"] },
      collectedAt: { gte: input.start, lte: input.end },
      handedOverAt: { not: null },
      collectedById: { not: null },
    },
    select: {
      collectedById: true,
      collectedAt: true,
      handedOverAt: true,
    },
  });
  for (const p of payments) {
    if (!p.collectedById || !p.collectedAt || !p.handedOverAt) continue;
    const heldMs = p.handedOverAt.getTime() - p.collectedAt.getTime();
    if (heldMs <= HANDOVER_SLA_MS) continue;
    // Make sure row exists even for techs with no completed visits in window
    const row = map.get(p.collectedById);
    if (row) row.lateHandoversCount += 1;
  }

  return [...map.values()]
    .map((r) => ({
      techId: r.techId,
      name: r.name,
      visitsCompleted: r.visitsCompleted,
      avgDurationMinutes:
        r.durationMsCount > 0
          ? Math.round(r.durationMsSum / r.durationMsCount / 60_000)
          : null,
      lateHandoversCount: r.lateHandoversCount,
    }))
    .sort(
      (a, b) =>
        b.visitsCompleted - a.visitsCompleted || a.name.localeCompare(b.name),
    );
}
