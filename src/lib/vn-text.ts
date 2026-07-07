/**
 * Fold a string to lowercase ASCII for diacritic-insensitive search/compare.
 *
 * Strips Vietnamese tone + vowel marks (via NFD decomposition) and maps đ/Đ → d
 * (which NFD leaves intact). Lets a plain-ASCII query match an accented string —
 * e.g. "Ho Chi" matches "Thành phố Hồ Chí Minh". No-op for plain ASCII.
 */
export function foldDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining tone/vowel marks
    .toLowerCase()
    .replaceAll("đ", "d"); // đ (Đ lowercases to đ first) — NFD leaves it intact
}
