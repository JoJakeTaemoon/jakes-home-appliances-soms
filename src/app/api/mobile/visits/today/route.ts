/**
 * GET /api/mobile/visits/today
 *
 * TECHNICIAN-only. Returns the calling technician's visits scheduled today,
 * split into `lead` and `collaborator` buckets. Sorted by scheduledFor asc.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { dayBounds } from "@/lib/scheduler/availability";

const ACTIVE_STATES = ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] as const;

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  handler: async ({ auth }) => {
    const { start, end } = dayBounds(new Date());
    const visits = await prisma.visit.findMany({
      where: {
        scheduledFor: { gte: start, lt: end },
        state: { in: [...ACTIVE_STATES] },
        OR: [
          { leadTechnicianId: auth.userId },
          { collaboratorTechnicianIds: { has: auth.userId } },
        ],
      },
      orderBy: { scheduledFor: "asc" },
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            address: true,
            district: true,
            city: true,
            contacts: {
              where: { role: "OPS_CONTACT", isPrimary: true },
              select: { name: true, phone1: true },
            },
          },
        },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: { select: { modelCode: true, name: true } },
          },
        },
      },
    });

    const lead = visits.filter((v) => v.leadTechnicianId === auth.userId);
    const collaborator = visits.filter(
      (v) => v.leadTechnicianId !== auth.userId,
    );
    return { lead, collaborator };
  },
});
