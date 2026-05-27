/**
 * Customer code allocator.
 *
 * Format: `KH#####` (KH00001..KH99999). The pool is shared between B2C and
 * B2B — sequence is global so codes never collide.
 *
 * Implementation note: in Phase 2 we allocate by scanning the max existing
 * code under a transaction. For Phase 6+ with multiple writers we'd switch
 * to a Postgres sequence; for now the simple read-then-write inside a
 * `prisma.$transaction` is sufficient and easy to reason about.
 */

import prisma from "@/lib/prisma";

const PREFIX = "KH";
const WIDTH = 5;
const MIN = 1;
const MAX = 99_999;

export function formatCustomerCode(n: number): string {
  if (!Number.isInteger(n) || n < MIN || n > MAX) {
    throw new RangeError(`Customer code out of range: ${n}`);
  }
  return `${PREFIX}${String(n).padStart(WIDTH, "0")}`;
}

export function parseCustomerCode(code: string): number | null {
  if (!code) return null;
  const m = /^KH(\d{5})$/.exec(code.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isInteger(n) || n < MIN || n > MAX) return null;
  return n;
}

/**
 * Find the next free `KH#####` code. Scans the table for the max numeric
 * value embedded in the existing codes and returns `max + 1`. Skips legacy
 * codes that don't fit the `KH#####` pattern.
 */
export async function allocateCustomerCode(
  client: { customer: { findMany: typeof prisma.customer.findMany } } = prisma,
): Promise<string> {
  const rows = await client.customer.findMany({
    select: { code: true },
    where: { code: { startsWith: PREFIX } },
  });
  let max = 0;
  for (const { code } of rows) {
    const n = parseCustomerCode(code);
    if (n !== null && n > max) max = n;
  }
  const next = max + 1;
  if (next > MAX) throw new Error("Customer code pool exhausted (KH99999)");
  return formatCustomerCode(next);
}
