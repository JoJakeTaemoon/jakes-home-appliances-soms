import { NextRequest } from "next/server";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { runVisitReminderD1 } from "@/lib/scheduler/cron-reminder";
import { requireCronAuth } from "@/lib/cron/guard";

export async function GET(request: NextRequest) {
  try {
    requireCronAuth(request);
    const start = Date.now();
    const summary = await runVisitReminderD1();
    return successResponse({
      elapsedMs: Date.now() - start,
      ranAt: new Date().toISOString(),
      ...summary,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
