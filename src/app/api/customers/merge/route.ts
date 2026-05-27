/**
 * POST /api/customers/merge — ADMIN only.
 * Body: { sourceId, targetId }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { mergeCustomers } from "@/lib/customers/merge";

const schema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const caller = await requireRole(request, "ADMIN");
    const parsed = schema.parse(await request.json());
    const result = await mergeCustomers({
      sourceId: parsed.sourceId,
      targetId: parsed.targetId,
      actorId: caller.userId,
    });
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
