/**
 * POST /api/admin/migration/import
 *
 * Two-step bulk migration. The same workbook is posted twice:
 *
 *   mode=validate → parse, check, and report. Nothing is written.
 *   mode=commit   → parse, check, and write, but only if the check is clean.
 *
 * The file is re-sent rather than parked on the server between the steps: the
 * browser still holds it, so a second upload costs nothing and there is no
 * half-finished import sitting in memory waiting to be confirmed. Commit
 * re-runs the whole validation, so a catalog that changed between preview and
 * confirm cannot slip a bad row through.
 *
 * ADMIN only. This creates live customers, contracts and equipment.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { readWorkbook, WorkbookFormatError } from "@/lib/xlsx/read-workbook";
import { planImport, type ExistingSnapshot } from "@/lib/migration/plan";
import { equipmentKey } from "@/lib/migration/export";
import { applyPlan } from "@/lib/migration/apply";

/** Guards the request body against a workbook nobody could have meant to send. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Everything the planner needs to know about current data, in five queries.
 *
 * The identifier sets hold both the customer's own code and ours. An export
 * writes whichever the row has, so accepting either is what lets a downloaded
 * workbook be re-uploaded without cloning the database into itself.
 */
async function loadSnapshot(): Promise<ExistingSnapshot> {
  const [customers, contracts, models, consumables, equipment] = await Promise.all([
    prisma.customer.findMany({ select: { code: true, legacyCode: true } }),
    prisma.contract.findMany({
      select: { contractNumber: true, legacyContractNumber: true },
    }),
    prisma.equipmentModel.findMany({
      where: { modelCode: { not: null } },
      select: { id: true, modelCode: true },
    }),
    prisma.consumable.findMany({ select: { id: true, sku: true } }),
    prisma.equipment.findMany({
      select: {
        serialNumber: true,
        assetCode: true,
        model: { select: { modelCode: true } },
      },
    }),
  ]);

  return {
    customerLegacyCodes: new Set(
      customers.flatMap((c) =>
        [c.legacyCode, c.code].filter(Boolean).map((v) => (v ?? "").toLowerCase()),
      ),
    ),
    contractLegacyNumbers: new Set(
      contracts.flatMap((c) =>
        [c.legacyContractNumber, c.contractNumber]
          .filter(Boolean)
          .map((v) => (v ?? "").toLowerCase()),
      ),
    ),
    modelCodes: new Map(
      models.map((m) => [(m.modelCode ?? "").toLowerCase(), m.id]),
    ),
    consumableSkus: new Map(consumables.map((c) => [c.sku.toLowerCase(), c.id])),
    equipmentSerials: new Set(
      equipment
        .filter((e) => e.model?.modelCode && e.serialNumber)
        .map(
          (e) =>
            `${(e.model?.modelCode ?? "").toLowerCase()}|${(e.serialNumber ?? "").toLowerCase()}`,
        ),
    ),
    equipmentKeys: new Set(
      equipment
        .filter((e) => e.assetCode)
        .map((e) => equipmentKey(e.model?.modelCode ?? null, e.assetCode ?? "")),
    ),
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "ADMIN") {
      throw new ForbiddenError("ADMIN required");
    }

    const form = await request.formData();
    const mode = String(form.get("mode") ?? "validate");
    if (mode !== "validate" && mode !== "commit") {
      throw new ValidationError("mode must be validate or commit");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required");
    }
    if (file.size > MAX_BYTES) {
      throw new ValidationError("File is larger than 20MB");
    }

    let sheets;
    try {
      sheets = readWorkbook(Buffer.from(await file.arrayBuffer()));
    } catch (e) {
      if (e instanceof WorkbookFormatError) throw new ValidationError(e.message);
      throw e;
    }

    const plan = planImport(sheets, await loadSnapshot());
    const counts = {
      customers: plan.customers.length,
      contracts: plan.contracts.length,
      equipment: plan.equipment.length,
      consumables: plan.equipment.reduce((n, e) => n + e.consumables.length, 0),
    };

    if (mode === "validate" || plan.errors.length > 0) {
      return successResponse({
        mode: "validate",
        committed: false,
        counts,
        skipped: plan.skipped,
        // A workbook with a thousand broken rows would otherwise return a
        // thousand lines nobody reads; the count says how many are hidden.
        errors: plan.errors.slice(0, 200),
        errorCount: plan.errors.length,
      });
    }

    const applied = await applyPlan(prisma, plan, auth.userId);
    return successResponse({
      mode: "commit",
      committed: true,
      counts,
      skipped: plan.skipped,
      applied,
      errors: [],
      errorCount: 0,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
