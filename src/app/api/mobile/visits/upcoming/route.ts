/**
 * GET /api/mobile/visits/upcoming
 *
 * TECHNICIAN-only. Returns visits scheduled in the next 7 days (excluding
 * today). Grouped by ISO date (YYYY-MM-DD).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";
import { dayBounds } from "@/lib/scheduler/availability";

const ACTIVE_STATES = ["SCHEDULED", "RESCHEDULED"] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }

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
            model: { select: { modelCode: true, name: true } },
          },
        },
      },
    });

    const grouped: Record<string, typeof visits> = {};
    for (const v of visits) {
      const key = v.scheduledFor.toISOString().slice(0, 10);
      (grouped[key] ??= []).push(v);
    }
    return successResponse({ grouped, total: visits.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
