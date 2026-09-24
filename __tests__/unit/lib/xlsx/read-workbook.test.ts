/**
 * Workbook reader — both formats office staff can hand back.
 *
 * The migration template goes out as SpreadsheetML 2003. Excel keeps that
 * format on "Save" but rewrites it to a real `.xlsx` on "Save As", so the
 * importer has to read either. The `.xlsx` fixture is a genuine Excel-format
 * file (written by openpyxl), not something this code produced — a reader
 * tested only against its own writer proves nothing about the ZIP walk,
 * shared strings, or `r="B3"` column refs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  readWorkbook,
  sheetToRecords,
  WorkbookFormatError,
} from "@/lib/xlsx/read-workbook";
import { buildSpreadsheetML } from "@/lib/xlsx/spreadsheet-ml";

const FIXTURE = join(process.cwd(), "__tests__/fixtures/migration-sample.xlsx");

describe("readWorkbook — .xlsx", () => {
  const wb = readWorkbook(readFileSync(FIXTURE));

  it("returns every sheet by name", () => {
    expect(Object.keys(wb).sort()).toEqual(["고객", "장비"]);
  });

  it("reads shared strings and numbers as text", () => {
    expect(wb["고객"][0]).toEqual(["고객코드", "고객명", "유형", "전화번호"]);
    expect(wb["고객"][1]).toEqual(["KH0001", "Nguyễn Thị Lan", "B2C", "0901234567"]);
  });

  it("keeps an interior blank cell aligned with its header", () => {
    // Row 3 of 장비 has no 시리얼; the date and quantity must not slide left.
    const rows = sheetToRecords(wb["장비"]);
    expect(rows[1]).toMatchObject({
      고객코드: "KH0002",
      모델코드: "PTS-3000",
      시리얼: "",
      설치일: "2024-06-01",
      수량: "2",
    });
  });
});

describe("readWorkbook — SpreadsheetML", () => {
  const xml = buildSpreadsheetML([
    {
      name: "고객",
      headers: ["고객코드", "고객명"],
      rows: [
        ["KH0001", "Nguyễn Thị Lan"],
        ["KH0002", "Lê <Văn> Minh & Co"],
      ],
    },
  ]);
  const wb = readWorkbook(Buffer.from(xml, "utf8"));

  it("round-trips what our own writer produced, escapes included", () => {
    expect(sheetToRecords(wb["고객"])).toEqual([
      { 고객코드: "KH0001", 고객명: "Nguyễn Thị Lan" },
      { 고객코드: "KH0002", 고객명: "Lê <Văn> Minh & Co" },
    ]);
  });
});

describe("readWorkbook — rejections", () => {
  it("refuses a CSV rather than guessing at it", () => {
    expect(() => readWorkbook(Buffer.from("a,b,c\n1,2,3", "utf8"))).toThrow(
      WorkbookFormatError,
    );
  });
});

describe("sheetToRecords", () => {
  it("drops blank rows and pads short ones", () => {
    const recs = sheetToRecords([
      ["a", "b", "c"],
      ["1", "2"],
      ["", "", ""],
      ["4", "5", "6"],
    ]);
    expect(recs).toEqual([
      { a: "1", b: "2", c: "" },
      { a: "4", b: "5", c: "6" },
    ]);
  });
});
