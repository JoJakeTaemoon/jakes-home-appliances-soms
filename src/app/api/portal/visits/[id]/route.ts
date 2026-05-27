/**
 * GET /api/portal/visits/[id] — visit detail for the customer.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { NotFoundError } from "@/lib/api/error";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const caller = await requireCustomerAuth(request);
    const { id } = await ctx.params;
    const visit = await prisma.visit.findUnique({
      where: { id },
      include: {
        equipment: {
          select: { id: true, serialNumber: true, model: { select: { name: true, modelCode: true } } },
        },
        leadTechnician: { select: { id: true, username: true } },
        documents: {
          orderBy: { generatedAt: "desc" },
          select: {
            id: true,
            kind: true,
            templateCode: true,
            filename: true,
            storageKey: true,
            generatedAt: true,
          },
        },
      },
    });
    if (!visit || visit.customerId !== caller.customerId) {
      throw new NotFoundError("Visit not found");
    }
    if (caller.scope === "SITE" && caller.siteId && visit.siteId !== caller.siteId) {
      throw new NotFoundError("Visit not found");
    }
    return successResponse(visit);
  } catch (err) {
    return toErrorResponse(err);
  }
}
