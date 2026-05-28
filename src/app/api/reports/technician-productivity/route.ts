/**
 * GET /api/reports/technician-productivity?start=YYYY-MM-DD&end=YYYY-MM-DD[&format=csv]
 *
 * UC-RP-03. STAFF+ access.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { getTechnicianProductivity } from "@/lib/reports/technician-productivity";
import { toCsv, csvResponse } from "@/lib/csv";

function parseDate(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ValidationError("Invalid date");
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const url = new URL(request.url);
    const end = parseDate(url.searchParams.get("end"), new Date());
    const defaultStart = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start = parseDate(url.searchParams.get("start"), defaultStart);
    const rows = await getTechnicianProductivity({ start, end });
    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(rows, [
        { key: "techId", label: "techId" },
        { key: "name", label: "Technician" },
        { key: "visitsCompleted", label: "Visits completed" },
        {
          key: "avgDurationMinutes",
          label: "Avg duration (min)",
          format: (v) => (v == null ? "" : v),
        },
        { key: "lateHandoversCount", label: "Late handovers" },
      ]);
      return csvResponse(
        csv,
        `tech-productivity-${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.csv`,
      );
    }
    return successResponse({
      start: start.toISOString(),
      end: end.toISOString(),
      rows,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
