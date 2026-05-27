/**
 * GET  /api/admin/scheduler-weights  → current weights + defaults
 * PUT  /api/admin/scheduler-weights  → upsert weights
 *
 * ADMIN only. Writes a SystemSetting row keyed `scheduler.weights`.
 *
 * GET migrated to `defineQuery`. PUT keeps the manual shape for the
 * AuditLog before/after pair.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError } from "@/lib/api/error";
import {
  SCHEDULER_WEIGHTS_DEFAULT,
  getSchedulerWeights,
  setSchedulerWeights,
} from "@/lib/settings";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  preferred: z.number().int().min(0).max(1000),
  regionMatch: z.number().int().min(0).max(1000),
  /** Stored as positive magnitude in the UI; scoring converts to negative. */
  loadPenaltyPerVisit: z.number().int().min(0).max(1000),
});

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "ADMIN") throw new ForbiddenError("Insufficient role");
  },
  handler: async () => ({
    current: await getSchedulerWeights(),
    defaults: SCHEDULER_WEIGHTS_DEFAULT,
  }),
});

export async function PUT(request: NextRequest) {
  try {
    const caller = await requireRole(request, "ADMIN");
    const parsed = schema.parse(await request.json());
    const before = await getSchedulerWeights();
    await setSchedulerWeights(parsed, caller.userId);
    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "SCHEDULER_WEIGHTS_UPDATE",
      entityType: "SystemSetting",
      entityId: "scheduler.weights",
      before,
      after: parsed,
      request,
    });
    return successResponse({ current: parsed });
  } catch (err) {
    return toErrorResponse(err);
  }
}
