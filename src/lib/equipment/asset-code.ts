/**
 * Equipment asset-code (장비코드 / 관리번호) allocator.
 *
 * Format (confirmed 2026-09-04):
 *
 *     {modelCode}{YY}{MM}{DD}{NNNN}      e.g. PTS2100 26 09 04 0001
 *
 *   - `modelCode`  — `EquipmentModel.modelCode`. Off-catalog devices (no
 *     model) and legacy models with a null code fall back to `AQS`.
 *   - `YYMMDD`     — the unit's **설치일** (`installedAt`) in Vietnam Standard
 *     Time, the same convention `src/lib/contracts/code.ts` uses.
 *   - `NNNN`       — 1-based sequence within that `{modelCode}{YYMMDD}` prefix.
 *
 * The sequence is **global**, never per-customer: `Equipment.assetCode` is
 * `@unique` across the whole table, so the same code can never be issued to
 * two units regardless of who owns them.
 *
 * Every registration path (single install, multi-line wizard, bulk wizard)
 * allocates through this module — the code is system-issued, never typed in.
 */

import type { Prisma } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { formatVstDateStamp } from "@/lib/contracts/code";

/** Prefix used when the device has no catalog model / the model has no code. */
export const ASSET_CODE_FALLBACK_MODEL_CODE = "AQS";

const SEQ_WIDTH = 4;

/** `{modelCode}{YYMMDD}` — everything left of the per-day sequence. */
export function assetCodePrefix(
  modelCode: string | null | undefined,
  installedAt: Date,
): string {
  const code = modelCode?.trim() || ASSET_CODE_FALLBACK_MODEL_CODE;
  // formatVstDateStamp → YYYYmmDD; drop the century to get YYmmDD.
  return `${code}${formatVstDateStamp(installedAt).slice(2)}`;
}

async function nextSequence(
  tx: Prisma.TransactionClient,
  prefix: string,
): Promise<number> {
  // Serialize allocations for this prefix until the transaction commits.
  // Without it two parallel registrations read the same max and both INSERT
  // `…0001`; Postgres aborts the entire interactive transaction on the
  // resulting P2002, so catch-and-retry inside the tx is not an option
  // (same constraint the contract-number allocator documents).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`;
  const taken = await tx.equipment.findMany({
    where: { assetCode: { startsWith: prefix } },
    select: { assetCode: true },
  });
  // ponytail: scan the prefix group and take the numeric max rather than
  // ORDER BY assetCode DESC LIMIT 1 — lexical ordering breaks past 9999 and
  // on any legacy non-numeric suffix. The group is one model on one day, so
  // it stays tiny; swap in a counter table only if that ever stops being true.
  let max = 0;
  for (const row of taken) {
    const n = Number(row.assetCode?.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Allocates one asset code per entry in `installedAts`, in order.
 *
 * Entries sharing a `{modelCode}{YYMMDD}` prefix get consecutive sequence
 * numbers. Rows written earlier in the same transaction are visible to later
 * calls (read-your-own-writes), so a multi-line wizard can call this once per
 * line without codes colliding across lines.
 */
export async function allocateAssetCodes(
  tx: Prisma.TransactionClient,
  modelCode: string | null | undefined,
  installedAts: Date[],
): Promise<string[]> {
  const byPrefix = new Map<string, number[]>();
  installedAts.forEach((at, i) => {
    const prefix = assetCodePrefix(modelCode, at);
    const bucket = byPrefix.get(prefix);
    if (bucket) bucket.push(i);
    else byPrefix.set(prefix, [i]);
  });

  const codes: string[] = new Array(installedAts.length);
  for (const [prefix, indices] of byPrefix) {
    const start = await nextSequence(tx, prefix);
    indices.forEach((target, offset) => {
      codes[target] = `${prefix}${String(start + offset).padStart(SEQ_WIDTH, "0")}`;
    });
  }
  return codes;
}

/**
 * Fills in 장비코드 for rows that predate the system-issued rule (legacy
 * imports, and the dev seed, which inserts equipment directly).
 *
 * Reuses the same allocator as every registration path, so back-filled units
 * join the existing per-prefix sequence instead of starting a parallel one.
 * Idempotent — rows that already have a code are untouched.
 *
 * Returns the number of rows written.
 */
export async function backfillMissingAssetCodes(
  client: PrismaClient,
  opts: { dryRun?: boolean; onAssign?: (id: string, code: string) => void } = {},
): Promise<number> {
  const pending = await client.equipment.findMany({
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
  if (pending.length === 0) return 0;

  // Group by model — the allocator takes one modelCode per call, and grouping
  // keeps each model's sequence contiguous.
  const byModel = new Map<string, typeof pending>();
  for (const eq of pending) {
    const key = eq.modelId ?? "__none__";
    const bucket = byModel.get(key);
    if (bucket) bucket.push(eq);
    else byModel.set(key, [eq]);
  }

  let written = 0;
  for (const [, rows] of byModel) {
    await client.$transaction(async (tx) => {
      const codes = await allocateAssetCodes(
        tx,
        rows[0].model?.modelCode ?? null,
        // Never installed (legacy import / fixture) → stamp with the row's
        // creation date so the code still says when it entered the system.
        rows.map((r) => r.installedAt ?? r.createdAt),
      );
      for (const [i, row] of rows.entries()) {
        opts.onAssign?.(row.id, codes[i]);
        if (opts.dryRun) continue;
        await tx.equipment.update({
          where: { id: row.id },
          data: { assetCode: codes[i] },
        });
        written += 1;
      }
    });
  }
  return written;
}
