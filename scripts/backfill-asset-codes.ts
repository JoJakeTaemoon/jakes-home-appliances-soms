/**
 * Backfill 장비코드 (Equipment.assetCode) for rows registered before the code
 * became system-issued.
 *
 * Uses the same allocator as every registration path, so back-filled units
 * slot into the existing per-{modelCode}{YYMMDD} sequence instead of starting
 * a parallel numbering. Rows are grouped by model so one transaction handles
 * one model's whole backlog.
 *
 *   npx tsx scripts/backfill-asset-codes.ts            # apply
 *   npx tsx scripts/backfill-asset-codes.ts --dry-run  # report only
 */

import "dotenv/config";
import prisma from "@/lib/prisma";
import { allocateAssetCodes } from "@/lib/equipment/asset-code";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const pending = await prisma.equipment.findMany({
    where: { assetCode: null },
    select: {
      id: true,
      modelId: true,
      installedAt: true,
      createdAt: true,
      model: { select: { modelCode: true } },
    },
    orderBy: [{ installedAt: "asc" }, { createdAt: "asc" }],
  });

  if (pending.length === 0) {
    console.log("Nothing to backfill — every Equipment row already has an assetCode.");
    return;
  }
  console.log(`${pending.length} equipment row(s) without an assetCode.`);

  // Group by model: the allocator takes one modelCode per call, and grouping
  // keeps each model's sequence contiguous.
  const byModel = new Map<string, typeof pending>();
  for (const eq of pending) {
    const key = eq.modelId ?? "__none__";
    const bucket = byModel.get(key);
    if (bucket) bucket.push(eq);
    else byModel.set(key, [eq]);
  }

  let updated = 0;
  for (const [, rows] of byModel) {
    const modelCode = rows[0].model?.modelCode ?? null;
    await prisma.$transaction(async (tx) => {
      const codes = await allocateAssetCodes(
        tx,
        modelCode,
        // No installedAt (never installed / legacy import) → stamp with the
        // registration date so the code still reflects when the unit entered
        // the system.
        rows.map((r) => r.installedAt ?? r.createdAt),
      );
      for (const [i, row] of rows.entries()) {
        console.log(`  ${row.id} → ${codes[i]}`);
        if (!dryRun) {
          await tx.equipment.update({
            where: { id: row.id },
            data: { assetCode: codes[i] },
          });
          updated += 1;
        }
      }
    });
  }

  console.log(dryRun ? "Dry run — nothing written." : `Backfilled ${updated} row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
