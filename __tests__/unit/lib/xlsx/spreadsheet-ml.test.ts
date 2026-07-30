import { describe, it, expect } from "vitest";
import { buildSpreadsheetML } from "@/lib/xlsx/spreadsheet-ml";

describe("buildSpreadsheetML", () => {
  it("wraps sheets in a valid SpreadsheetML workbook", () => {
    const xml = buildSpreadsheetML([
      { name: "Catalog", headers: ["A", "B"], rows: [["x", 1]] },
    ]);
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(xml).toContain('<Worksheet ss:Name="Catalog">');
    expect(xml).toContain('<Data ss:Type="String">A</Data>');
    expect(xml).toContain('<Data ss:Type="Number">1</Data>');
  });

  it("emits one header row plus one row per data row, each with all cells", () => {
    const xml = buildSpreadsheetML([
      { name: "S", headers: ["h1", "h2"], rows: [["a", "b"], ["c", "d"]] },
    ]);
    expect((xml.match(/<Row>/g) ?? []).length).toBe(3); // header + 2 data
    expect((xml.match(/<Cell>/g) ?? []).length).toBe(6); // 3 rows × 2 cells
  });

  it("escapes XML-special characters so a value can't break the document", () => {
    const xml = buildSpreadsheetML([
      { name: "S", headers: ["h"], rows: [['<b> & "q"']] },
    ]);
    expect(xml).toContain("&lt;b&gt; &amp; &quot;q&quot;");
    expect(xml).not.toContain("<b>");
  });

  it("renders empty / null / undefined as empty string cells (not Number)", () => {
    const xml = buildSpreadsheetML([
      { name: "S", headers: ["h"], rows: [[null], [undefined], [""]] },
    ]);
    expect((xml.match(/<Data ss:Type="String"><\/Data>/g) ?? []).length).toBe(3);
  });

  it("supports multiple sheets and clamps/sanitizes tab names", () => {
    const xml = buildSpreadsheetML([
      { name: "Models", headers: [], rows: [] },
      { name: "A/very:long[name]that*exceeds the excel limit of 31", headers: [], rows: [] },
    ]);
    expect(xml).toContain('ss:Name="Models"');
    // ':' '/' '[' ']' '*' replaced with spaces, then trimmed to 31 chars
    expect(xml).toMatch(/ss:Name="A very long name that exceed/);
    expect(xml).not.toContain("[name]");
  });
});
