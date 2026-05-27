/**
 * GET /api/mobile/visits/today
 *
 * TECHNICIAN-only. Returns the calling technician's visits scheduled today,
 * split into `lead` and `collaborator` buckets. Sorted by scheduledFor asc.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";
import { dayBounds } from "@/lib/scheduler/availability";

const ACTIVE_STATES = ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
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
    return successResponse({ lead, collaborator });
  } catch (err) {
    return toErrorResponse(err);
  }
}
