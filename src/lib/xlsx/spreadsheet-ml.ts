/**
 * Minimal SpreadsheetML 2003 (.xls XML) writer — zero dependencies (요청 A: Excel
 * 내보내기, 의존성 최소화).
 *
 * SpreadsheetML is a documented Microsoft XML format that Excel (and LibreOffice
 * / Google Sheets) opens natively as a real multi-sheet workbook — unlike CSV it
 * keeps typed cells and multiple sheets, and unlike a binary .xlsx it needs no
 * ZIP library. Serve with `Content-Type: application/vnd.ms-excel` and a `.xls`
 * filename. UTF-8 throughout, so Vietnamese/Korean text survives.
 */

export type XlsxCell = string | number | null | undefined;

export interface XlsxSheet {
  /** Worksheet tab name. Excel caps this at 31 chars and forbids : \ / ? * [ ]. */
  name: string;
  headers: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<XlsxCell>>;
}

// Control chars XML 1.0 forbids, except tab (\x09), newline (\x0A), CR (\x0D);
// leaving them in makes Excel reject the whole file.
const XML_FORBIDDEN_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(XML_FORBIDDEN_CONTROL, "");
}

/** Excel sheet names are ≤31 chars and can't contain : \ / ? * [ ]. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replaceAll(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

function cellXml(value: XlsxCell): string {
  if (value === null || value === undefined || value === "") {
    return '<Cell><Data ss:Type="String"></Data></Cell>';
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`;
}

function rowXml(cells: ReadonlyArray<XlsxCell>): string {
  return `<Row>${cells.map(cellXml).join("")}</Row>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const rows = [sheet.headers, ...sheet.rows];
  const body = rows.map(rowXml).join("");
  return `<Worksheet ss:Name="${escapeXml(sanitizeSheetName(sheet.name))}"><Table>${body}</Table></Worksheet>`;
}

/** Build a complete SpreadsheetML workbook document from one or more sheets. */
export function buildSpreadsheetML(sheets: ReadonlyArray<XlsxSheet>): string {
  const body = sheets.map(sheetXml).join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    body +
    "</Workbook>"
  );
}
