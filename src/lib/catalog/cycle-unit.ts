/**
 * Filter replace-cycle unit conversion (요청 A — 필터 단위 일/개월).
 *
 * A Consumable's replace cycle is stored canonically in DAYS. The catalog
 * form lets office staff enter it in days or months; 1 month = 30 days by
 * project convention (matches the ×30 rule used elsewhere for month inputs).
 */

export type CycleUnit = "DAY" | "MONTH";

const DAYS_PER_MONTH = 30;

/** Form value (in the chosen unit) → canonical days for storage. Always an
 *  integer — the schema stores days as Int, so a fractional month input (or a
 *  months value re-derived from a non-30-multiple day count) rounds to the
 *  nearest whole day rather than failing validation. */
export function cycleToStored(value: string, unit: CycleUnit): number | null {
  if (value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(unit === "MONTH" ? n * DAYS_PER_MONTH : n);
}

/** Canonical days → form value in the given unit for display/edit. Months are
 *  rounded to 2 decimals so a non-30-multiple day count doesn't surface a long
 *  float in the input. */
export function cycleToDisplay(days: number | null, unit: CycleUnit): string {
  if (days == null) return "";
  if (unit === "MONTH") return String(Math.round((days / DAYS_PER_MONTH) * 100) / 100);
  return String(days);
}
