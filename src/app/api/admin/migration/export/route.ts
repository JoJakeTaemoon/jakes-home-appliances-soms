/**
 * GET /api/admin/migration/export[?customerId=…]
 *
 * Downloads live customers, contracts, equipment and consumables in the same
 * workbook shape the import screen reads, so the file can be corrected and
 * handed straight back. Without `customerId` it exports everything, which is
 * also the backup to take before a second migration run.
 *
 * A plain handler rather than `defineQuery`, which would wrap the body in the
 * JSON envelope. ADMIN only: the file carries every customer's
 * contact details and pricing.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/api/error";
import { toErrorResponse } from "@/lib/api/response";
import { logAudit } from "@/lib/audit";
import { buildMigrationExport } from "@/lib/migration/export";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "ADMIN") {
      throw new ForbiddenError("ADMIN required");
    }

    const customerId =
      new URL(request.url).searchParams.get("customerId") ?? undefined;
    const body = await buildMigrationExport(prisma, { customerId });

    // Bulk customer data leaving the system is worth a trail of its own.
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "MIGRATION_EXPORTED",
      entityType: "Customer",
      entityId: customerId ?? null,
      after: { scope: customerId ? "single-customer" : "all", bytes: body.length },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="jakes-home-appliances-data-${stamp}.xls"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
