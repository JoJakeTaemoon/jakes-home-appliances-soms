/**
 * GET /api/reports/audit?actorId=&entityType=&action=&start=&end=&q=&page=&pageSize=[&format=csv]
 *
 * UC-RP-06. **ADMIN / MANAGER only** — STAFF + TECHNICIAN are 403.
 * Sensitive fields in `before`/`after` are masked via `redact()` before
 * leaving the server. Each row is augmented with `entityDisplay` resolved
 * via `resolveEntityDisplays()` so the UI can show "김철수" instead of a
 * raw cuid.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { searchAuditLog, type AuditSearchRow } from "@/lib/reports/audit-search";
import { toCsv, csvResponse } from "@/lib/csv";
import { redact } from "@/lib/audit/redact";
import { resolveEntityDisplays } from "@/lib/audit/entity-resolver";

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

interface OutgoingRow extends AuditSearchRow {
  entityDisplay: string | null;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER"]);
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
    });

    // Resolve entity displays in a single batched call.
    const displays = await resolveEntityDisplays(
      result.rows.map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
      })),
    );

    // Apply redaction + entity display per row.
    const rows: OutgoingRow[] = result.rows.map((r) => {
      const display =
        r.entityId != null
          ? displays.get(`${r.entityType}:${r.entityId}`) ?? null
          : null;
      return {
        ...r,
        before: redact(r.before),
        after: redact(r.after),
        entityDisplay: display,
      };
    });

    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(rows, [
        { key: "at", label: "At" },
        { key: "actorType", label: "Actor type" },
        { key: "actorName", label: "Actor" },
        { key: "actorRole", label: "Actor role" },
        { key: "action", label: "Action" },
        { key: "entityType", label: "Entity type" },
        { key: "entityId", label: "Entity ID" },
        { key: "entityDisplay", label: "Entity" },
        { key: "ipAddress", label: "IP" },
      ]);
      return csvResponse(
        csv,
        `audit-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    }
    return successResponse({
      rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
