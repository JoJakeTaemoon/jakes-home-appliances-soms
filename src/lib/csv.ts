/**
 * Minimal CSV writer for report exports.
 *
 * - Quotes fields containing commas, quotes, or newlines (RFC 4180 style).
 * - Prepends UTF-8 BOM so Excel auto-detects the encoding and renders Korean
 *   + Vietnamese diacritics correctly.
 * - Accepts an explicit column order; if omitted, infers from the first row.
 *
 * Stateless and dependency-free — sized for ≤ a few thousand rows. For
 * bigger exports, stream via a generator instead.
 */

const BOM = "﻿";

export interface CsvColumn<T> {
  key: keyof T & string;
  label?: string;
  /** Optional cell transformer (e.g. Date → ISO string, Decimal → number). */
  format?: (value: T[keyof T], row: T) => string | number | boolean | null;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends object>(
  rows: T[],
  columns?: CsvColumn<T>[],
): string {
  if (rows.length === 0) {
    if (!columns || columns.length === 0) return BOM;
    return BOM + columns.map((c) => escapeCell(c.label ?? c.key)).join(",") + "\r\n";
  }
  const cols: CsvColumn<T>[] =
    columns ??
    (Object.keys(rows[0]) as (keyof T & string)[]).map((k) => ({ key: k }));
  const header = cols.map((c) => escapeCell(c.label ?? c.key)).join(",");
  const lines = rows.map((row) =>
    cols
      .map((c) => {
        const raw = row[c.key];
        const val = c.format ? c.format(raw, row) : raw;
        return escapeCell(val);
      })
      .join(","),
  );
  return BOM + header + "\r\n" + lines.join("\r\n") + "\r\n";
}

/** Wrap a CSV body in a Response with download headers. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
