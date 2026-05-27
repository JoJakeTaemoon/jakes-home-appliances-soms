/**
 * GET /api/visits/map — visit counts by region for the next 7 days.
 *
 * Used by the placeholder /visits/map UI (a real geocoded map is deferred
 * to Phase 8+).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const visits = await prisma.visit.findMany({
      where: {
        state: { in: ["SUGGESTED", "SCHEDULED", "IN_PROGRESS"] },
        scheduledFor: { gte: now, lte: horizon },
      },
      select: {
        id: true,
        siteId: true,
        customer: {
          select: {
            preferredRegion: true,
            city: true,
            district: true,
          },
        },
      },
    });
    // Fetch site regions for visits that have a siteId
    const siteIds = visits
      .map((v) => v.siteId)
      .filter((id): id is string => !!id);
    const siteMap = new Map<string, string | null>();
    if (siteIds.length > 0) {
      const sites = await prisma.site.findMany({
        where: { id: { in: siteIds } },
        select: { id: true, region: true },
      });
      for (const s of sites) siteMap.set(s.id, s.region);
    }
    const byRegion = new Map<string, number>();
    for (const v of visits) {
      const region =
        (v.siteId ? siteMap.get(v.siteId) : null) ??
        v.customer.preferredRegion ??
        v.customer.district ??
        v.customer.city ??
        "UNASSIGNED";
      byRegion.set(region, (byRegion.get(region) ?? 0) + 1);
    }
    const rows = [...byRegion.entries()]
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count);
    return successResponse({
      total: visits.length,
      windowStart: now.toISOString(),
      windowEnd: horizon.toISOString(),
      regions: rows,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
