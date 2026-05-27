/**
 * GET /api/reports/revenue?year=2026&month=5[&format=csv]
 *
 * UC-RP-02. STAFF+ access.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { getMonthlyRevenue } from "@/lib/reports/revenue";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
    const month = Number(
      url.searchParams.get("month") ?? now.getUTCMonth() + 1,
    );
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      throw new ValidationError("Invalid year");
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      throw new ValidationError("Invalid month");
    }
    const data = await getMonthlyRevenue({ year, month });
    if (url.searchParams.get("format") === "csv") {
      const rows = data.byMonth.map((m) => ({
        period: `${m.year}-${String(m.month).padStart(2, "0")}`,
        total: m.total,
        sale: m.byType.SALE,
        rental: m.byType.RENTAL,
        maintenance: m.byType.MAINTENANCE,
        serviceRequestFee: m.byType.SERVICE_REQUEST_FEE,
      }));
      const csv = toCsv(rows, [
        { key: "period", label: "Period" },
        { key: "total", label: "Total" },
        { key: "sale", label: "Sale" },
        { key: "rental", label: "Rental" },
        { key: "maintenance", label: "Maintenance" },
        { key: "serviceRequestFee", label: "Service request fee" },
      ]);
      return csvResponse(
        csv,
        `revenue-${year}-${String(month).padStart(2, "0")}.csv`,
      );
    }
    return successResponse(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
