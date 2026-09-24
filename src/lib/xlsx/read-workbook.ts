/**
 * Multi-sheet workbook reader — zero dependencies.
 *
 * The migration template is handed out as SpreadsheetML 2003 (see
 * `spreadsheet-ml.ts`, which writes it). Office staff open it in Excel, fill
 * it in and save — and whether "Save" keeps the XML format or "Save As"
 * rewrites it to a real `.xlsx` is not something we can dictate. So this
 * reader accepts both and returns the same shape either way:
 *
 *   { "고객": [["고객코드", "고객명", …], ["KH0001", "Nguyen…", …]], … }
 *
 * Row 0 is whatever the file's first row is — the caller decides which row is
 * the header. Trailing empty cells are trimmed, but interior blanks are kept
 * so column positions stay aligned with the header.
 *
 * `.xlsx` is a ZIP of XML parts. Node's zlib does the only hard part
 * (raw-deflate), leaving a central-directory walk and two small XML scrapes —
 * cheaper than taking on a spreadsheet dependency for one import screen.
 */

import { inflateRawSync } from "node:zlib";

export type SheetRows = string[][];
export type Workbook = Record<string, SheetRows>;

export class WorkbookFormatError extends Error {}

/** Detects the container and dispatches. `.csv` is deliberately not accepted. */
export function readWorkbook(buffer: Buffer): Workbook {
  if (buffer.length >= 4 && buffer.subarray(0, 2).toString("latin1") === "PK") {
    return readXlsx(buffer);
  }
  const head = buffer.subarray(0, 512).toString("utf8");
  if (head.includes("<?xml") || head.includes("<Workbook")) {
    return readSpreadsheetML(buffer.toString("utf8"));
  }
  throw new WorkbookFormatError(
    "Unsupported file. Save the template as Excel (.xlsx) or keep the XML Spreadsheet 2003 format (.xls).",
  );
}

// ── XML helpers ─────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);
}

/** Concatenated text of every `<t>` node, which is how shared strings and
 *  inline strings carry rich-text runs. */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) =>
    decodeXml(m[1]),
  );
  return parts.length > 0 ? parts.join("") : decodeXml(stripTags(xml));
}

function stripTags(xml: string): string {
  return xml.replace(/<[^>]*>/g, "");
}

function trimTrailingBlanks(row: string[]): string[] {
  let end = row.length;
  while (end > 0 && row[end - 1] === "") end -= 1;
  return row.slice(0, end);
}

// ── SpreadsheetML 2003 ──────────────────────────────────────────────────

function readSpreadsheetML(xml: string): Workbook {
  const out: Workbook = {};
  const sheetRe = /<Worksheet[^>]*ss:Name="([^"]*)"[^>]*>([\s\S]*?)<\/Worksheet>/g;
  for (const [, rawName, body] of xml.matchAll(sheetRe)) {
    const rows: SheetRows = [];
    for (const [, rowXml] of body.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)) {
      const row: string[] = [];
      for (const [, attrs, cellXml] of rowXml.matchAll(
        /<Cell([^>]*)>([\s\S]*?)<\/Cell>|<Cell([^>]*)\/>/g,
      )) {
        // `ss:Index` skips columns; pad so positions keep matching the header.
        const index = /ss:Index="(\d+)"/.exec(attrs ?? "")?.[1];
        if (index) while (row.length < Number(index) - 1) row.push("");
        row.push(cellXml ? textOf(cellXml).trim() : "");
      }
      rows.push(trimTrailingBlanks(row));
    }
    out[decodeXml(rawName)] = rows;
  }
  if (Object.keys(out).length === 0) {
    throw new WorkbookFormatError("No worksheets found in the XML spreadsheet.");
  }
  return out;
}

// ── .xlsx (ZIP) ─────────────────────────────────────────────────────────

/**
 * Walks the ZIP end-of-central-directory record rather than scanning for local
 * headers: only the central directory is authoritative about where each entry
 * starts, and data-descriptor entries make local headers unreliable.
 */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new WorkbookFormatError("Not a readable .xlsx file.");

  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    // The local header repeats the name/extra with its own lengths.
    const lNameLen = buffer.readUInt16LE(localOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buffer.subarray(start, start + compressedSize);

    if (method === 0) entries.set(name, Buffer.from(raw));
    else if (method === 8) entries.set(name, inflateRawSync(raw));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** `A12` → 0-based column index. */
function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buffer: Buffer): Workbook {
  const files = unzip(buffer);

  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textOf(m[1]),
  );

  // Sheet name → target part, resolved through the workbook rels.
  const wbXml = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const relTarget = new Map<string, string>();
  for (const [, id, target] of relsXml.matchAll(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    relTarget.set(id, target.replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const out: Workbook = {};
  for (const [, attrs] of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /name="([^"]*)"/.exec(attrs)?.[1];
    const rid = /r:id="([^"]*)"/.exec(attrs)?.[1];
    if (!name) continue;
    const part = (rid && relTarget.get(rid)) || "";
    const sheetXml =
      files.get(`xl/${part}`)?.toString("utf8") ??
      files.get(`xl/worksheets/sheet${Object.keys(out).length + 1}.xml`)?.toString("utf8");
    if (!sheetXml) continue;
    out[decodeXml(name)] = parseSheetXml(sheetXml, shared);
  }

  if (Object.keys(out).length === 0) {
    throw new WorkbookFormatError("No worksheets found in the .xlsx file.");
  }
  return out;
}

function parseSheetXml(xml: string, shared: string[]): SheetRows {
  const rows: SheetRows = [];
  for (const [, rowXml] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const [, attrs, body] of rowXml.matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g,
    )) {
      const a = attrs ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(a)?.[1];
      if (ref) while (row.length < colIndex(ref)) row.push("");

      const type = /t="([^"]+)"/.exec(a)?.[1];
      const inner = body ?? "";
      let value = "";
      if (type === "s") {
        const idx = Number(stripTags(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ""));
        value = shared[idx] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(inner);
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }
      row.push(value.trim());
    }
    rows.push(trimTrailingBlanks(row));
  }
  return rows;
}

/**
 * Rows of a sheet as objects keyed by the header row, with blank rows dropped.
 * Header cells are trimmed; a row shorter than the header yields empty strings
 * for the missing columns so callers never see `undefined`.
 */
export function sheetToRecords(rows: SheetRows): Array<Record<string, string>> {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Array<Record<string, string>> = [];
  for (const row of rows.slice(1)) {
    if (row.every((c) => c === "")) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = (row[i] ?? "").trim();
    });
    out.push(rec);
  }
  return out;
}
