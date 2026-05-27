/**
 * GET /api/portal/visits — UC-PT-03. Visit history for the logged-in customer.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);
    const where: Record<string, unknown> = { customerId: caller.customerId };
    // SITE-scoped OPS contacts only see their own site
    if (caller.scope === "SITE" && caller.siteId) {
      where.siteId = caller.siteId;
    }
    const rows = await prisma.visit.findMany({
      where,
      orderBy: [{ scheduledFor: "desc" }],
      take: 100,
      include: {
        equipment: {
          select: { id: true, serialNumber: true, model: { select: { name: true, modelCode: true } } },
        },
        leadTechnician: { select: { id: true, username: true } },
      },
    });
    return successResponse(rows);
  } catch (err) {
    return toErrorResponse(err);
  }
}
