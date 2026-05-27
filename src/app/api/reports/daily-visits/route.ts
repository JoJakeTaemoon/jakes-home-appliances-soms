/**
 * GET /api/reports/daily-visits?date=YYYY-MM-DD[&format=csv]
 *
 * UC-RP-01. STAFF+ may view; TECHNICIAN is denied (their own per-day view
 * lives at /mobile/today).
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { getDailyVisitSummary } from "@/lib/reports/visit-summary";
import { toCsv, csvResponse } from "@/lib/csv";

function parseDate(raw: string | null): Date {
  if (!raw) return new Date();
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(raw);
  if (!m) throw new ValidationError("Invalid date");
  return new Date(`${raw}T00:00:00.000Z`);
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const url = new URL(request.url);
    const date = parseDate(url.searchParams.get("date"));
    const data = await getDailyVisitSummary(date);
    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(data.byTechnician, [
        { key: "techId", label: "techId" },
        { key: "name", label: "Technician" },
        { key: "total", label: "Total" },
        { key: "completed", label: "Completed" },
      ]);
      return csvResponse(
        csv,
        `daily-visits-${data.date}.csv`,
      );
    }
    return successResponse(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
