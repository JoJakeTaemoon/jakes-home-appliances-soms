/**
 * Locale-aware formatter for audit diff cells.
 *
 * Handles the half-dozen value shapes that show up in our `before`/`after`
 * payloads: null/undefined placeholders, booleans, ISO datetime strings,
 * numbers (with optional currency hint), referenceIds (resolved via the
 * entity-resolver map), and small objects/arrays.
 */

import {
  formatDate as formatDateVst,
  formatDateTime as formatDateTimeVst,
} from "@/lib/format";

export type AuditLocale = "ko" | "en" | "vi";

export interface ReferenceIdHint {
  kind: "referenceId";
  entityType: string;
  /** Map keyed by `${entityType}:${id}` → display string. */
  resolved: Map<string, string>;
}

export interface MoneyHint {
  kind: "money";
  /** Optional ISO currency code. v1 only formats the number. */
  currency?: string;
}

export type FormatHint = ReferenceIdHint | MoneyHint;

function safeLocale(locale: string): AuditLocale {
  if (locale === "en" || locale === "vi" || locale === "ko") return locale;
  return "ko";
}

const NONE_PLACEHOLDER: Record<AuditLocale, string> = {
  ko: "(없음)",
  en: "(none)",
  vi: "(không có)",
};

const BOOL_TRUE: Record<AuditLocale, string> = {
  ko: "예",
  en: "Yes",
  vi: "Có",
};

const BOOL_FALSE: Record<AuditLocale, string> = {
  ko: "아니오",
  en: "No",
  vi: "Không",
};

const ISO_FULL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Audit timestamps render on the VST wall clock like the rest of the app.
 * The previous implementation used `getDate()` / `getHours()`, so the same
 * audit row read differently depending on the viewer's machine timezone.
 */
function formatDate(iso: string, locale: AuditLocale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (ISO_DATE_ONLY.test(iso)) return formatDateVst(d, locale);
  return formatDateTimeVst(d, locale);
}

function formatNumber(n: number, locale: AuditLocale, money: boolean): string {
  if (!money) {
    // Integer pass-through (avoid Intl en-US comma artifacts on small ints).
    if (Number.isInteger(n) && Math.abs(n) < 1000) return String(n);
  }
  try {
    return n.toLocaleString(
      locale === "vi" ? "vi-VN" : locale === "ko" ? "ko-KR" : "en-US",
    );
  } catch {
    return String(n);
  }
}

/**
 * Format a value for display in the diff table.
 *
 *   formatValue(null, "ko")                           // "(없음)"
 *   formatValue(true, "en")                           // "Yes"
 *   formatValue("2026-05-26T00:00:00.000Z", "vi")     // "26/05/2026 ..."
 *   formatValue("c1", "ko", { kind: "referenceId",
 *     entityType: "Customer", resolved: map })        // "김철수"
 */
export function formatValue(
  value: unknown,
  locale: string,
  hint?: FormatHint,
): string {
  const loc = safeLocale(locale);

  if (value === null || value === undefined) return NONE_PLACEHOLDER[loc];

  if (typeof value === "boolean") {
    return value ? BOOL_TRUE[loc] : BOOL_FALSE[loc];
  }

  if (typeof value === "number") {
    return formatNumber(value, loc, hint?.kind === "money");
  }

  if (typeof value === "string") {
    // referenceId hint → display map lookup
    if (hint?.kind === "referenceId") {
      const got = hint.resolved.get(`${hint.entityType}:${value}`);
      if (got) return got;
      return value; // fallback to raw id
    }
    if (ISO_FULL.test(value) || ISO_DATE_ONLY.test(value)) {
      return formatDate(value, loc);
    }
    return value;
  }

  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}
