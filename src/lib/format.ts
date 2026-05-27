/**
 * Locale-aware formatting helpers.
 *
 * - VI uses DD/MM/YYYY (per locale memory 2026-05-26).
 * - KO and EN use ISO YYYY-MM-DD.
 * - Currency defaults to VND in 1.500.000 ₫ format.
 *
 * Pure functions — safe in Server and Client components.
 */

export type AppLocale = "vi" | "ko" | "en";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format a date as a locale-appropriate calendar date (no time). */
export function formatDate(value: Date | string | null | undefined, locale: AppLocale | string = "vi"): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  if (locale === "vi") return `${dd}/${mm}/${yyyy}`;
  // ko / en / unknown -> ISO
  return `${yyyy}-${mm}-${dd}`;
}

/** Format a datetime as locale-appropriate date + 24h time. */
export function formatDateTime(value: Date | string | null | undefined, locale: AppLocale | string = "vi"): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const date = formatDate(d, locale);
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${date} ${hh}:${mi}`;
}

/** Format a VND amount as `1.500.000 ₫`. Returns empty string for nullish. */
export function formatVnd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded).toString();
  const withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withDots} ₫`;
}

/** Parse a "1.500.000 ₫" / "1,500,000" / "1500000" string into a number. */
export function parseVnd(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
