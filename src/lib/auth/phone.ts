/**
 * Phone is the staff login key (since 2026-05-28), so every write path has to
 * agree on its stored shape. Normalize before `findUnique({ where: { phone } })`
 * or the same human number lands twice under different spellings.
 */

/** "+84-90-000-0001" / "0900000001" / " 090 000 0001 " → "0900000001". */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}
