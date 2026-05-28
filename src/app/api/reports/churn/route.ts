/**
 * GET /api/reports/churn?year=2026&quarter=2[&format=csv]
 *
 * UC-RP-05. STAFF+ access.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { getCustomerChurn } from "@/lib/reports/churn";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
    const quarter = Number(
      url.searchParams.get("quarter") ??
        Math.floor(now.getUTCMonth() / 3) + 1,
    );
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      throw new ValidationError("Invalid year");
    }
    if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
      throw new ValidationError("Invalid quarter");
    }
    const data = await getCustomerChurn({ year, quarter });
    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(data.rows, [
        { key: "customerCode", label: "Customer code" },
        { key: "customerName", label: "Customer" },
        { key: "type", label: "Type" },
        { key: "deactivatedAt", label: "Deactivated at" },
        { key: "reason", label: "Reason" },
        { key: "monthlyValueLost", label: "Monthly value lost (VND)" },
      ]);
      return csvResponse(csv, `churn-${year}-Q${quarter}.csv`);
    }
    return successResponse(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
