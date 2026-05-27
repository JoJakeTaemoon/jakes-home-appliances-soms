/**
 * GET /api/mobile/cash-on-hand — sum of own COLLECTED-not-yet-HANDED_OVER
 * payments. Mobile dashboard pulls this for the badge + 48h countdown.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
    const rows = await prisma.payment.findMany({
      where: {
        collectedById: auth.userId,
        state: "COLLECTED",
        method: "CASH",
      },
      select: { id: true, actualAmount: true, collectedAt: true },
      orderBy: { collectedAt: "asc" },
    });
    const total = rows.reduce(
      (acc, p) => acc + Number(p.actualAmount.toString()),
      0,
    );
    const oldest = rows[0]?.collectedAt ?? null;
    const hoursOldest = oldest
      ? Math.floor((Date.now() - oldest.getTime()) / (60 * 60 * 1000))
      : 0;
    return successResponse({
      total,
      count: rows.length,
      oldestHours: hoursOldest,
      slaBreach: hoursOldest >= 48,
      payments: rows.map((p) => ({
        id: p.id,
        actualAmount: p.actualAmount.toString(),
        collectedAt: p.collectedAt,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
