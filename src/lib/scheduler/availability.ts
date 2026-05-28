/**
 * Technician availability queries used by the recommender (C.1 + C.2).
 *
 * Daily load = count of Visits with `leadTechnicianId = X` AND
 * `scheduledFor` falling on the same calendar day (UTC). Cancelled / no-show
 * visits don't burn capacity.
 */

import prisma from "@/lib/prisma";

const ACTIVE_STATES = ["SUGGESTED", "SCHEDULED", "IN_PROGRESS"] as const;

/** Returns [dayStart, dayStart+1) for the date portion of `scheduledFor`. */
export function dayBounds(scheduledFor: Date): { start: Date; end: Date } {
  const d = new Date(scheduledFor);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Number of *active* visits the technician is already scheduled to lead on
 * the calendar day of `date`. Collaborator-only visits are excluded —
 * scheduling is keyed off the lead.
 */
export async function getTechnicianLoad(
  technicianId: string,
  date: Date,
): Promise<number> {
  const { start, end } = dayBounds(date);
  return prisma.visit.count({
    where: {
      leadTechnicianId: technicianId,
      scheduledFor: { gte: start, lt: end },
      state: { in: [...ACTIVE_STATES] },
    },
  });
}

/**
 * True iff the technician has no active visit within a `windowMinutes` window
 * centered on `scheduledFor`. Used to gate the "preferred technician" pick.
 */
export async function isAvailable(
  technicianId: string,
  scheduledFor: Date,
  windowMinutes = 240,
): Promise<boolean> {
  const half = (windowMinutes / 2) * 60 * 1000;
  const start = new Date(scheduledFor.getTime() - half);
  const end = new Date(scheduledFor.getTime() + half);
  const conflict = await prisma.visit.findFirst({
    where: {
      leadTechnicianId: technicianId,
      scheduledFor: { gte: start, lte: end },
      state: { in: [...ACTIVE_STATES] },
    },
    select: { id: true },
  });
  return !conflict;
}

/**
 * Bulk version — returns a Map of `technicianId → load` for the same date.
 * Single SQL round-trip instead of N. Used by the recommender.
 */
export async function getLoadMap(
  technicianIds: string[],
  date: Date,
): Promise<Map<string, number>> {
  if (technicianIds.length === 0) return new Map();
  const { start, end } = dayBounds(date);
  const rows = await prisma.visit.groupBy({
    by: ["leadTechnicianId"],
    where: {
      leadTechnicianId: { in: technicianIds },
      scheduledFor: { gte: start, lt: end },
      state: { in: [...ACTIVE_STATES] },
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const id of technicianIds) map.set(id, 0);
  for (const r of rows) {
    if (r.leadTechnicianId) map.set(r.leadTechnicianId, r._count._all);
  }
  return map;
}
