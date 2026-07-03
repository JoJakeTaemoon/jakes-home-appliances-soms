/**
 * Locale-aware formatting helpers.
 *
 * - VI uses DD/MM/YYYY (per locale memory 2026-05-26).
 * - KO and EN use ISO YYYY-MM-DD.
 * - Currency defaults to VND in 1.500.000 ₫ format.
 * - **All times are VST (Asia/Ho_Chi_Minh, UTC+7) in 24h format** —
 *   the app operates from a single office in HCMC, so we render every
 *   time in that wall clock regardless of the viewer's browser TZ.
 *   Persistence stays UTC in the database; the boundary conversion
 *   happens here.
 *
 * Pure functions — safe in Server and Client components.
 */

export type AppLocale = "vi" | "ko" | "en";

/** Asia/Ho_Chi_Minh is UTC+7 year-round — Vietnam does not observe DST. */
const VST_TIMEZONE = "Asia/Ho_Chi_Minh";
const VST_OFFSET_HOURS = 7;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

interface VstParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

/** Decompose an absolute instant into VST calendar/clock parts. */
function vstParts(d: Date): VstParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // "24" as an hour appears in some engines for midnight — normalize to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
}

/** Format a date as a locale-appropriate calendar date (no time), VST. */
export function formatDate(value: Date | string | null | undefined, locale: AppLocale | string = "vi"): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const { year, month, day } = vstParts(d);
  if (locale === "vi") return `${day}/${month}/${year}`;
  // ko / en / unknown -> ISO
  return `${year}-${month}-${day}`;
}

/** Short locale weekday — e.g. ko "월", vi "Th 2", en "Mon". Returns "" on bad input. */
export function formatWeekday(
  value: Date | string | null | undefined,
  locale: AppLocale | string = "vi",
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
  } catch {
    return "";
  }
}

/** Format a datetime as locale-appropriate date + 24h HH:mm time in VST. */
export function formatDateTime(value: Date | string | null | undefined, locale: AppLocale | string = "vi"): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const date = formatDate(d, locale);
  const { hour, minute } = vstParts(d);
  return `${date} ${hour}:${minute}`;
}

/** Format just the time-of-day (HH:mm, 24h) in VST. */
export function formatTime(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const { hour, minute } = vstParts(d);
  return `${hour}:${minute}`;
}

/**
 * UTC ISO / Date → `YYYY-MM-DDTHH:mm` for use as an
 * `<input type="datetime-local">` value. Emits VST wall clock so the
 * picker matches what the office sees on the visit list.
 */
export function toVstDateTimeInput(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const { year, month, day, hour, minute } = vstParts(d);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * UTC ISO / Date → `HH:mm` for `<input type="time">` value (VST).
 * Alias of `formatTime` — kept as a distinct name for readability at
 * call sites where the intent is "prep an input value", not "render
 * for display".
 */
export const toVstTimeInput = formatTime;

/**
 * `<input type="datetime-local">` value (`YYYY-MM-DDTHH:mm`) → UTC ISO
 * string. Interprets the value as VST wall clock and converts by
 * subtracting the constant +7 offset — Vietnam does not observe DST,
 * so a fixed offset is exact.
 *
 * Rounds minutes down to the nearest 10 to enforce the office's 10-min
 * granularity even if a user pastes an arbitrary value into the field.
 */
export function fromVstDateTimeInput(local: string): string {
  if (!local) return "";
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, miRaw] = timePart.split(":").map(Number);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(miRaw)
  ) {
    return "";
  }
  const mi = Math.floor(miRaw / 10) * 10;
  return new Date(Date.UTC(y, m - 1, d, hh - VST_OFFSET_HOURS, mi)).toISOString();
}

/**
 * Combine a VST calendar date (`YYYY-MM-DD`) and a VST time (`HH:mm`)
 * into a UTC ISO string. Convenient when the UI has two separate
 * inputs rather than one datetime-local field.
 */
export function combineVstDateAndTime(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return "";
  return fromVstDateTimeInput(`${dateStr}T${timeStr}`);
}

/** VST time-picker step is 10 minutes (600 seconds). */
export const VST_TIME_STEP_SECONDS = 600;
/** Same value rendered as an HTML attribute string. */
export const VST_TIME_STEP = String(VST_TIME_STEP_SECONDS);

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
