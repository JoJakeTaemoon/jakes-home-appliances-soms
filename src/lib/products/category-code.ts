/**
 * ProductCategory code derivation.
 *
 * `ProductCategory.code` is UPPER_SNAKE_CASE and unique. Two paths need to
 * mint one from a human-typed name: the CSV catalog import and the inline
 * "제품군 추가" popup in the catalog admin. Keep the rule in one place so a
 * category created either way lands on the same code.
 */

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
    .replace(/^_+|_+$/g, "");
  return slug || "CATEGORY";
}
