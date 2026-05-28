/**
 * GET /api/reports/audit?actorId=&entityType=&action=&start=&end=&q=&page=&pageSize=[&format=csv]
 *
 * UC-RP-06. MANAGER+ sees everything; STAFF is scoped to their own actions.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { searchAuditLog } from "@/lib/reports/audit-search";
import { toCsv, csvResponse } from "@/lib/csv";

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError("Invalid date");
  }
  return d;
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requireRole(request, [
      "ADMIN",
      "MANAGER",
      "STAFF",
    ]);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("pageSize") ?? 50)),
    );
    const result = await searchAuditLog({
      actorId: url.searchParams.get("actorId"),
      entityType: url.searchParams.get("entityType"),
      action: url.searchParams.get("action"),
      start: parseDate(url.searchParams.get("start")),
      end: parseDate(url.searchParams.get("end")),
      q: url.searchParams.get("q"),
      page,
      pageSize,
      forceActorId: caller.role === "STAFF" ? caller.userId : null,
    });
    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(result.rows, [
        { key: "at", label: "At" },
        { key: "actorType", label: "Actor type" },
        { key: "actorName", label: "Actor" },
        { key: "action", label: "Action" },
        { key: "entityType", label: "Entity type" },
        { key: "entityId", label: "Entity ID" },
        { key: "ipAddress", label: "IP" },
      ]);
      return csvResponse(
        csv,
        `audit-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    }
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
