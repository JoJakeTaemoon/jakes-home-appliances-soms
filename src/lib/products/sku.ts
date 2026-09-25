/**
 * Catalog SKU allocator (소모품 / 부속품).
 *
 * Format:
 *
 *     {PREFIX}-{NNNNNN}     e.g. FLT-000001 … FLT-999999
 *
 * Nobody types a SKU by hand any more — the form leaves it blank and the route
 * mints the next one, the same way `Equipment.assetCode` works. A typed SKU is
 * still honoured; the office keeps the descriptive ones it already uses
 * (`FLT-AIR-HEPA-6`), and those simply sit outside this sequence.
 */

const SEQ_WIDTH = 6;

/** Fixed prefixes. `FLT` = 필터/소모품, `ACC` = 부속품 — matches the seeded catalog. */
export const CONSUMABLE_SKU_PREFIX = "FLT";
export const ACCESSORY_SKU_PREFIX = "ACC";

/** `FLT-000042` for sequence 42. */
export function formatSku(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(SEQ_WIDTH, "0")}`;
}

/**
 * The next free `{PREFIX}-{NNNNNN}` given the SKUs already in the table.
 *
 * Takes the numeric max rather than sorting: descriptive SKUs (`FLT-AIR-HEPA-6`)
 * share the prefix and sort *above* every numeric one, so `ORDER BY sku DESC`
 * would hand back a name, not a number. Anything that is not exactly
 * `PREFIX-` + digits is ignored.
 */
export function nextSku(prefix: string, taken: readonly string[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d{${SEQ_WIDTH},})$`);
  let max = 0;
  for (const sku of taken) {
    const n = Number(pattern.exec(sku)?.[1]);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return formatSku(prefix, max + 1);
}
