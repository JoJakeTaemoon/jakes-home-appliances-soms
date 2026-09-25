/**
 * ProductCategory code derivation.
 *
 * `ProductCategory.code` is UPPER_SNAKE_CASE and unique, and nobody types it
 * by hand any more — the CSV catalog import, the 제품군 tab and the inline
 * "제품군 추가" popup all leave it blank and let the server mint one. Keeping
 * the rule here means a category created any of those ways lands on the same
 * code.
 */

/**
 * `createProductCategorySchema` caps the code at 30 characters, so a long
 * name has to be cut here rather than bounce off the API as "Invalid body".
 */
const MAX_CODE_LENGTH = 30;

export function categoryCodeFromName(name: string): string {
  const slug = name
    .normalize("NFD")
    // Strip combining diacritics so Vietnamese input ("Máy lọc nước") yields
    // MAY_LOC_NUOC instead of collapsing the accented letters into "_".
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_CODE_LENGTH)
    .replace(/_+$/, "");
  return slug || "CATEGORY";
}

/**
 * A free code for `name`, falling back to `BASE_2`, `BASE_3`, … when the
 * plain derivation is taken.
 *
 * Collisions are not an edge case: a Korean-only name derives no Latin
 * letters at all, so every one of them would otherwise land on `CATEGORY`
 * and the second one would fail with a 409 the office cannot act on.
 *
 * `isTaken` is injected so the caller decides what "taken" means — a DB
 * lookup for the API, or the DB plus the rows the current CSV batch is about
 * to write.
 */
export async function allocateCategoryCode(
  name: string,
  isTaken: (code: string) => Promise<boolean>,
): Promise<string> {
  const base = categoryCodeFromName(name);
  if (!(await isTaken(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `_${n}`;
    const candidate =
      base.slice(0, MAX_CODE_LENGTH - suffix.length).replace(/_+$/, "") + suffix;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`No free category code for "${name}"`);
}
