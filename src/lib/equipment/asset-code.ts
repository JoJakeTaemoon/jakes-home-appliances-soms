/**
 * Equipment asset-code (장비코드 / 관리번호) allocator.
 *
 * Format (confirmed 2026-09-07):
 *
 *     MAY-{NNNNNN}        e.g. MAY-000001 … MAY-999999
 *
 *   - `MAY-` is a fixed literal prefix on every device (máy = 기기).
 *   - `NNNNNN` is a 6-digit sequence **scoped to the EquipmentModel**, so each
 *     model counts up from MAY-000001 independently.
 *
 * Consequence — and this is the point of the rule: the code string alone is
 * **not** globally unique. Two different models each have a MAY-000001. What
 * must be unique is the PAIR `(modelId, assetCode)`, enforced by
 * `@@unique([modelId, assetCode])` on the model.
 *
 * Issued when the unit is assigned to a customer. `Equipment.customerId` is
 * required, so registration *is* assignment: every registration path allocates
 * through this module and nothing else writes `assetCode`.
 */

import type { Prisma } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

/** Fixed literal prefix shared by every device, regardless of model. */
export const ASSET_CODE_PREFIX = "MAY-";

const SEQ_WIDTH = 6;

/**
 * Lock / grouping key for off-catalog devices (`modelId = null` — a customer's
 * own third-party unit under a MAINTENANCE contract). They share one sequence.
 *
 * ponytail: `@@unique([modelId, assetCode])` does NOT cover this bucket —
 * Postgres treats NULLs as distinct, so the DB would accept a duplicate there.
 * The advisory lock below is what actually keeps it unique, and `assetCode` is
 * never writable from the API, so nothing else can introduce one. If Prisma
 * ever supports `nullsNotDistinct`, add it and delete this note.
 */
const NO_MODEL_BUCKET = "__no_model__";

/** `MAY-000042` for sequence 42. */
export function formatAssetCode(sequence: number): string {
  return `${ASSET_CODE_PREFIX}${String(sequence).padStart(SEQ_WIDTH, "0")}`;
}

async function nextSequence(
  tx: Prisma.TransactionClient,
  modelId: string | null,
): Promise<number> {
  // Serialize allocations for this model until the transaction commits.
  // Without it two parallel registrations of the same model read the same max
  // and both INSERT `MAY-000001`; Postgres aborts the entire interactive
  // transaction on the resulting unique violation, so catch-and-retry inside
  // the tx is not an option (same constraint the contract-number allocator
  // documents).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${modelId ?? NO_MODEL_BUCKET}))`;
  const taken = await tx.equipment.findMany({
    where: { modelId, assetCode: { startsWith: ASSET_CODE_PREFIX } },
    select: { assetCode: true },
  });
  // ponytail: scan this model's codes and take the numeric max rather than
  // ORDER BY assetCode DESC LIMIT 1 — lexical ordering breaks past 999999 and
  // on any legacy non-conforming suffix. One model's fleet stays small enough
  // to scan; swap in a counter table only if that stops being true.
  let max = 0;
  for (const row of taken) {
    const n = Number(row.assetCode?.slice(ASSET_CODE_PREFIX.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Allocates `count` consecutive codes for one model, continuing that model's
 * own sequence.
 *
 * Rows written earlier in the same transaction are visible to later calls
 * (read-your-own-writes), so a multi-line wizard can call this once per line
 * and two lines sharing a model still get a continuous run.
 */
export async function allocateAssetCodes(
  tx: Prisma.TransactionClient,
  modelId: string | null,
  count: number,
): Promise<string[]> {
  if (count <= 0) return [];
  const start = await nextSequence(tx, modelId);
  return Array.from({ length: count }, (_, i) => formatAssetCode(start + i));
}

/**
 * Fills in 장비코드 for rows inserted outside the API — the dev seed's
 * fixtures, or a legacy import.
 *
 * Reuses the same allocator, so back-filled units continue their model's
 * sequence instead of starting a parallel one. Idempotent: rows that already
 * have a code are untouched.
 *
 * Returns the number of rows written.
 */
export async function backfillMissingAssetCodes(
  client: PrismaClient,
  opts: { dryRun?: boolean; onAssign?: (id: string, code: string) => void } = {},
): Promise<number> {
  const pending = await client.equipment.findMany({
    where: { assetCode: null },
    select: { id: true, modelId: true },
    orderBy: [{ installedAt: "asc" }, { createdAt: "asc" }],
  });
  if (pending.length === 0) return 0;

  // One transaction per model — the sequence is per-model, and grouping keeps
  // each model's run contiguous.
  const byModel = new Map<string | null, string[]>();
  for (const eq of pending) {
    const bucket = byModel.get(eq.modelId);
    if (bucket) bucket.push(eq.id);
    else byModel.set(eq.modelId, [eq.id]);
  }

  let written = 0;
  for (const [modelId, ids] of byModel) {
    await client.$transaction(async (tx) => {
      const codes = await allocateAssetCodes(tx, modelId, ids.length);
      for (const [i, id] of ids.entries()) {
        opts.onAssign?.(id, codes[i]);
        if (opts.dryRun) continue;
        await tx.equipment.update({ where: { id }, data: { assetCode: codes[i] } });
        written += 1;
      }
    });
  }
  return written;
}
