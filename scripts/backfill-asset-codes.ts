/**
 * Fills in 장비코드 (Equipment.assetCode) for rows that predate the
 * system-issued rule — legacy imports, or any DB seeded before it landed.
 *
 * The dev seed already runs this sweep itself (see the tail of
 * `prisma/seed.ts`), so this CLI is for databases you do NOT reseed: the
 * production / vhost.vn migration, or a staging box you want fixed in place.
 * Point DATABASE_URL at the target and run it from a workstation — the app
 * container image ships neither `scripts/` nor `src/lib/`.
 *
 *   npx tsx scripts/backfill-asset-codes.ts            # apply
 *   npx tsx scripts/backfill-asset-codes.ts --dry-run  # report only
 */

import "dotenv/config";
import prisma from "@/lib/prisma";
import { backfillMissingAssetCodes } from "@/lib/equipment/asset-code";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const written = await backfillMissingAssetCodes(prisma, {
    dryRun,
    onAssign: (id, code) => console.log(`  ${id} → ${code}`),
  });
  if (dryRun) {
    console.log("Dry run — nothing written.");
  } else if (written === 0) {
    console.log("Nothing to backfill — every Equipment row already has an assetCode.");
  } else {
    console.log(`Backfilled ${written} row(s).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
