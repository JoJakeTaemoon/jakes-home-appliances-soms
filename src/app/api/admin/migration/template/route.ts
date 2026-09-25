/**
 * GET /api/admin/migration/template
 *
 * Downloads the migration workbook: a Guide sheet in Korean and Vietnamese
 * plus one sheet per entity, each carrying filled example rows.
 *
 * SpreadsheetML 2003 rather than a real `.xlsx` — Excel, LibreOffice and
 * Google Sheets all open it as a multi-sheet workbook, and writing it needs
 * no ZIP library. The importer reads back either format, so it does not
 * matter which one the operator saves.
 *
 * A plain handler rather than `defineQuery`, which would wrap the body in the
 * JSON envelope. ADMIN only: the file's shape maps the catalog.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/api/error";
import { toErrorResponse } from "@/lib/api/response";
import { buildMigrationTemplate } from "@/lib/migration/template";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "ADMIN") {
      throw new ForbiddenError("ADMIN required");
    }

    return new Response(buildMigrationTemplate(), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="seoul-aqua-migration-template.xls"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
