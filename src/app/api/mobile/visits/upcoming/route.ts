/**
 * GET /api/mobile/visits/upcoming
 *
 * TECHNICIAN-only. Returns visits scheduled in the next 7 days (excluding
 * today). Grouped by ISO date (YYYY-MM-DD).
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { dayBounds } from "@/lib/scheduler/availability";

const ACTIVE_STATES = ["SCHEDULED", "RESCHEDULED"] as const;

export const GET = defineQuery({
  audience: "field",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  handler: async ({ auth }) => {
    const { end: todayEnd } = dayBounds(new Date());
    const horizon = new Date(todayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const visits = await prisma.visit.findMany({
      where: {
        scheduledFor: { gte: todayEnd, lt: horizon },
        state: { in: [...ACTIVE_STATES] },
        OR: [
          { leadTechnicianId: auth.userId },
          { collaboratorTechnicianIds: { has: auth.userId } },
        ],
      },
      orderBy: { scheduledFor: "asc" },
      include: {
        customer: { select: { id: true, code: true, name: true, type: true } },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: { select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true } },
          },
        },
      },
    });

    const grouped: Record<string, typeof visits> = {};
    for (const v of visits) {
      const key = v.scheduledFor.toISOString().slice(0, 10);
      (grouped[key] ??= []).push(v);
    }
    return { grouped, total: visits.length };
  },
});
