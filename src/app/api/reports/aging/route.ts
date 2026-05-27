/**
 * GET /api/reports/aging[?format=csv]
 *
 * UC-RP-04. STAFF+ access.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { getArAging } from "@/lib/reports/aging";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const url = new URL(request.url);
    const data = await getArAging();
    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(data.rows, [
        { key: "customerCode", label: "Customer code" },
        { key: "customerName", label: "Customer" },
        { key: "paymentId", label: "Payment ID" },
        { key: "expectedAmount", label: "Expected" },
        { key: "actualAmount", label: "Actual" },
        { key: "outstanding", label: "Outstanding" },
        { key: "dueDate", label: "Due" },
        { key: "daysOverdue", label: "Days overdue" },
        { key: "bucket", label: "Bucket" },
      ]);
      return csvResponse(
        csv,
        `aging-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    }
    return successResponse(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
