import { NextRequest } from "next/server";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { runJob } from "@/lib/cron/job";
import { recurringPaymentsJob } from "@/lib/cron/recurring-payments";
import { requireCronAuth } from "@/lib/cron/guard";

export async function GET(request: NextRequest) {
  try {
    requireCronAuth(request);
    const summary = await runJob(recurringPaymentsJob, { request });
    return successResponse({
      elapsedMs: summary.durationMs,
      ranAt: summary.finishedAt.toISOString(),
      ...summary,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
