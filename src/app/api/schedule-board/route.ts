/**
 * GET /api/schedule-board?date=YYYY-MM-DD
 *
 * Track 1 — daily assignment board. Returns the SUGGESTED queue (visits
 * not yet assigned to any technician) and, for each ACTIVE technician,
 * the day's SCHEDULED/IN_PROGRESS/RESCHEDULED visits. Office STAFF+ only.
 *
 * The unassigned queue is **not** filtered by date — pending visits
 * scheduled for any future day surface here so the operator can sweep
 * them all in one screen. Per-technician columns are scoped to the
 * requested day.
 */

import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import prisma from "@/lib/prisma";
import { VisitWorkflow } from "@/lib/visits/workflow";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function startEndOfDay(yyyymmdd: string): { start: Date; end: Date } {
  const [y, m, d] = yyyymmdd.split("-").map((p) => Number.parseInt(p, 10));
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Cannot view schedule board");
    }
  },
  query: querySchema,
  handler: async ({ query }) => {
    const { start, end } = startEndOfDay(query.date);

    // SUGGESTED queue — all visits with state=SUGGESTED, regardless of date,
    // so the operator can sweep the backlog. Ordered by scheduledFor asc so
    // the soonest ones come first.
    const unassigned = await prisma.visit.findMany({
      where: { state: "SUGGESTED" },
      select: {
        id: true,
        type: true,
        state: true,
        scheduledFor: true,
        scheduledWindow: true,
        customerId: true,
        siteId: true,
        leadTechnicianId: true,
        collaboratorTechnicianIds: true,
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            preferredTechnicianId: true,
            preferredRegion: true,
          },
        },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: {
              select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true },
            },
            site: { select: { id: true, name: true, region: true } },
          },
        },
      },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    });

    // Per-technician columns for the day. Only SCHEDULED / IN_PROGRESS /
    // RESCHEDULED — completed and cancelled don't belong on a "load" view.
    const technicians = await prisma.user.findMany({
      where: { role: "TECHNICIAN", status: "ACTIVE" },
      select: {
        id: true,
        username: true,
        preferredRegion: true,
      },
      orderBy: { username: "asc" },
    });
    const techIds = technicians.map((t) => t.id);

    const dayVisits = await prisma.visit.findMany({
      where: {
        scheduledFor: { gte: start, lte: end },
        state: { in: ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] },
        leadTechnicianId: { in: techIds },
      },
      select: {
        id: true,
        type: true,
        state: true,
        scheduledFor: true,
        scheduledWindow: true,
        leadTechnicianId: true,
        collaboratorTechnicianIds: true,
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: {
              select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true },
            },
            site: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { scheduledFor: "asc" },
    });

    const byTech = new Map<string, typeof dayVisits>();
    for (const v of dayVisits) {
      if (!v.leadTechnicianId) continue;
      const arr = byTech.get(v.leadTechnicianId) ?? [];
      arr.push(v);
      byTech.set(v.leadTechnicianId, arr);
    }

    const columns = technicians.map((t) => ({
      id: t.id,
      username: t.username,
      preferredRegion: t.preferredRegion,
      visits: byTech.get(t.id) ?? [],
    }));

    return {
      date: query.date,
      unassigned,
      technicians: columns,
    };
  },
});
