import { NextRequest } from "next/server";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { runJob } from "@/lib/cron/job";
import { visitReminderJob } from "@/lib/cron/visit-reminder";
import { requireCronAuth } from "@/lib/cron/guard";

export async function GET(request: NextRequest) {
  try {
    requireCronAuth(request);
    const summary = await runJob(visitReminderJob, { request });
    return successResponse({
      elapsedMs: summary.durationMs,
      ranAt: summary.finishedAt.toISOString(),
      ...summary,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
