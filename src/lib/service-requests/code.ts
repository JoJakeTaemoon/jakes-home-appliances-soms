/**
 * Service Request code allocator.
 *
 * Format: `SR-#####` (5-digit zero-padded sequence, scoped globally — not
 * per-customer). The sequence is read off the highest existing
 * `ServiceRequest.code` matching the prefix; concurrent inserts race on the
 * unique-index, and the caller retries with the next number.
 *
 * Phase 5 keeps the dirt-simple integer scan. Volumes are low (<10k/year
 * forecast); when this becomes a hotspot, swap for a Postgres sequence
 * (`CREATE SEQUENCE sr_code_seq`) or an advisory-lock + counter table.
 */

import prisma from "@/lib/prisma";

const PREFIX = "SR-";
const PAD = 5;

function format(n: number): string {
  return `${PREFIX}${n.toString().padStart(PAD, "0")}`;
}

function parse(code: string): number | null {
  if (!code.startsWith(PREFIX)) return null;
  const n = Number.parseInt(code.slice(PREFIX.length), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Return the next available SR code. Caller passes it directly to
 * `prisma.serviceRequest.create({ data: { code, ... } })`. If two callers
 * race they may both compute the same number; the unique constraint will
 * blow up on the loser and the route should retry.
 */
export async function allocateServiceRequestCode(): Promise<string> {
  const last = await prisma.serviceRequest.findFirst({
    where: { code: { startsWith: PREFIX } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNum = last ? parse(last.code) ?? 0 : 0;
  return format(lastNum + 1);
}

/** Internal helpers exposed for tests. */
export const __test = { format, parse, PREFIX, PAD };
