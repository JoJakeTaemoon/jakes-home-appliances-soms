/**
 * Daily-visit summary report (UC-RP-01).
 *
 * Buckets every Visit whose `scheduledFor` falls on the given calendar date
 * (interpreted in the system's wall-clock timezone) by state, plus a
 * per-technician completion count.
 */

import prisma from "@/lib/prisma";

export interface DailyVisitSummary {
  date: string; // YYYY-MM-DD
  scheduled: number;
  inProgress: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
  byTechnician: Array<{
    techId: string;
    name: string;
    total: number;
    completed: number;
  }>;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getDailyVisitSummary(
  date: Date,
): Promise<DailyVisitSummary> {
  const start = startOfDay(date);
  const end = endOfDay(date);
  const visits = await prisma.visit.findMany({
    where: { scheduledFor: { gte: start, lte: end } },
    select: {
      id: true,
      state: true,
      leadTechnicianId: true,
      leadTechnician: { select: { id: true, username: true } },
    },
  });

  const counts: Record<string, number> = {
    SUGGESTED: 0,
    SCHEDULED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    FAILED_NO_SHOW: 0,
    RESCHEDULED: 0,
    CANCELLED: 0,
  };
  const perTech = new Map<
    string,
    { techId: string; name: string; total: number; completed: number }
  >();
  for (const v of visits) {
    counts[v.state] = (counts[v.state] ?? 0) + 1;
    if (v.leadTechnician) {
      const t = perTech.get(v.leadTechnician.id) ?? {
        techId: v.leadTechnician.id,
        name: v.leadTechnician.username,
        total: 0,
        completed: 0,
      };
      t.total += 1;
      if (v.state === "COMPLETED") t.completed += 1;
      perTech.set(v.leadTechnician.id, t);
    }
  }
  const byTechnician = [...perTech.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  );

  const iso = start.toISOString().slice(0, 10);
  return {
    date: iso,
    scheduled: counts.SCHEDULED + counts.SUGGESTED,
    inProgress: counts.IN_PROGRESS,
    completed: counts.COMPLETED,
    failed: counts.FAILED_NO_SHOW,
    cancelled: counts.CANCELLED + counts.RESCHEDULED,
    total: visits.length,
    byTechnician,
  };
}
