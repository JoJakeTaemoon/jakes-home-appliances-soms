/**
 * Migration planning — the validation surface the preview screen reports and
 * the commit step obeys. Both call this same function, so a preview that
 * reports "no errors" cannot disagree with what the import writes.
 *
 * Pure input/output: sheets in, plan and issues out. No database.
 */

import { describe, it, expect } from "vitest";
import {
  planImport,
  SHEETS,
  HEADERS,
  type ExistingSnapshot,
} from "@/lib/migration/plan";

const EMPTY: ExistingSnapshot = {
  customerLegacyCodes: new Set(),
  contractLegacyNumbers: new Set(),
  modelCodes: new Map([["pts-2100", "model-1"]]),
  consumableSkus: new Map([["filt-sed", "cons-1"]]),
  equipmentSerials: new Set(),
  equipmentKeys: new Set(),
};

function sheets(over: Partial<Record<string, string[][]>> = {}) {
  return {
    [SHEETS.customers]: [[...HEADERS.customers]],
    [SHEETS.contracts]: [[...HEADERS.contracts]],
    [SHEETS.equipment]: [[...HEADERS.equipment]],
    [SHEETS.consumables]: [[...HEADERS.consumables]],
    ...over,
  };
}

const CUSTOMER = ["KH0001", "Nguyen Thi Lan", "B2C", "", "", "Lan", "0901234567", "", "vi", "", "", ""];
const CONTRACT = ["HD-2024-001", "KH0001", "RENTAL", "2024-03-01", "36", "300000", "1000000", "", ""];
const EQUIPMENT = ["E1", "KH0001", "HD-2024-001", "PTS-2100", "", "SN-1", "2024-03-05", "RENTAL", "FULL_SERVICE", "300000", "", ""];

describe("planImport — happy path", () => {
  const plan = planImport(
    sheets({
      [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
      [SHEETS.contracts]: [[...HEADERS.contracts], CONTRACT],
      [SHEETS.equipment]: [[...HEADERS.equipment], EQUIPMENT],
      [SHEETS.consumables]: [
        [...HEADERS.consumables],
        ["E1", "FILT-SED", "", "2", "180", "2024-03-05", ""],
      ],
    }),
    EMPTY,
  );

  it("reports no errors", () => {
    expect(plan.errors).toEqual([]);
  });

  it("nests consumables under their equipment", () => {
    expect(plan.equipment).toHaveLength(1);
    expect(plan.equipment[0].consumables).toEqual([
      {
        equipmentKey: "E1",
        sku: "FILT-SED",
        customName: null,
        quantity: 2,
        replaceEveryDays: 180,
        lastReplacedDate: "2024-03-05",
        notes: null,
      },
    ]);
  });

  it("parses Vietnamese thousand separators as numbers", () => {
    const p = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [
          [...HEADERS.contracts],
          ["HD-2", "KH0001", "RENTAL", "2024-03-01", "36", "1.500.000", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(p.contracts[0].monthlyFee).toBe(1_500_000);
  });
});

describe("planImport — referential integrity", () => {
  it("rejects a contract pointing at an unknown customer", () => {
    const plan = planImport(
      sheets({
        [SHEETS.contracts]: [
          [...HEADERS.contracts],
          ["HD-9", "KH-NOPE", "RENTAL", "2024-03-01", "36", "", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(
      expect.objectContaining({ sheet: SHEETS.contracts, row: 2, column: "Customer Code" }),
    );
  });

  it("accepts a customer that is already in the database", () => {
    const plan = planImport(
      sheets({
        [SHEETS.contracts]: [
          [...HEADERS.contracts],
          ["HD-9", "KH-OLD", "RENTAL", "2024-03-01", "36", "", "", "", ""],
        ],
      }),
      { ...EMPTY, customerLegacyCodes: new Set(["kh-old"]) },
    );
    expect(plan.errors).toEqual([]);
  });

  it("rejects a model code that is not in the catalog", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.equipment]: [
          [...HEADERS.equipment],
          ["E1", "KH0001", "", "NOPE-1", "", "", "2024-03-05", "RENTAL", "", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(
      expect.objectContaining({ column: "Model Code" }),
    );
  });

  it("rejects a consumable pointing at an unknown equipment key", () => {
    const plan = planImport(
      sheets({
        [SHEETS.consumables]: [
          [...HEADERS.consumables],
          ["NOPE", "FILT-SED", "", "1", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(
      expect.objectContaining({ sheet: SHEETS.consumables, column: "Equipment Key" }),
    );
  });
});

describe("planImport — re-upload", () => {
  it("skips rows whose code already exists instead of duplicating them", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [[...HEADERS.contracts], CONTRACT],
        [SHEETS.equipment]: [[...HEADERS.equipment], EQUIPMENT],
      }),
      {
        ...EMPTY,
        customerLegacyCodes: new Set(["kh0001"]),
        contractLegacyNumbers: new Set(["hd-2024-001"]),
        equipmentSerials: new Set(["pts-2100|sn-1"]),
      },
    );
    expect(plan.skipped).toEqual({ customers: 1, contracts: 1, equipment: 1 });
    expect(plan.customers).toHaveLength(0);
    expect(plan.errors).toEqual([]);
  });

  it("catches a code duplicated inside the file itself", () => {
    const plan = planImport(
      sheets({ [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER, CUSTOMER] }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(
      expect.objectContaining({ row: 3, message: "duplicated inside the file" }),
    );
  });
});

describe("planImport — field rules", () => {
  it("requires a shortcode for B2B because the contract code is built from it", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [
          [...HEADERS.customers],
          ["KH1", "SHERATON", "B2B", "", "", "Minh", "0901112233", "", "vi", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(
      expect.objectContaining({ column: "Shortcode" }),
    );
  });

  it("requires term months on a rental", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [
          [...HEADERS.contracts],
          ["HD-3", "KH0001", "RENTAL", "2024-03-01", "", "", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(
      expect.objectContaining({ column: "Term Months" }),
    );
  });

  it("refuses an ambiguous date rather than guessing day-first or month-first", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [
          [...HEADERS.contracts],
          ["HD-4", "KH0001", "SALE", "03/04/2024", "", "", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(
      expect.objectContaining({ column: "Start Date" }),
    );
  });

  it("accepts an Excel date serial, which is what a date-formatted cell gives", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [
          [...HEADERS.contracts],
          ["HD-5", "KH0001", "SALE", "45383", "", "", "", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toEqual([]);
    // 45292 is 2024-01-01; +91 days lands on 1 April in a leap year.
    expect(plan.contracts[0].startDate).toBe("2024-04-01");
  });

  it("names every missing sheet before looking at any row", () => {
    const plan = planImport({ [SHEETS.customers]: [[...HEADERS.customers]] }, EMPTY);
    expect(plan.errors.map((e) => e.sheet).sort()).toEqual(
      [SHEETS.consumables, SHEETS.contracts, SHEETS.equipment].sort(),
    );
  });
});

describe("planImport — re-uploading a finished workbook", () => {
  it("says nothing to do rather than flagging the consumables of skipped equipment", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [[...HEADERS.contracts], CONTRACT],
        [SHEETS.equipment]: [[...HEADERS.equipment], EQUIPMENT],
        [SHEETS.consumables]: [
          [...HEADERS.consumables],
          ["E1", "FILT-SED", "", "1", "180", "", ""],
        ],
      }),
      {
        ...EMPTY,
        customerLegacyCodes: new Set(["kh0001"]),
        contractLegacyNumbers: new Set(["hd-2024-001"]),
        equipmentSerials: new Set(["pts-2100|sn-1"]),
      },
    );
    expect(plan.errors).toEqual([]);
    expect(plan.skipped.equipment).toBe(1);
    expect(plan.equipment).toHaveLength(0);
  });
});

describe("the shipped template", () => {
  it("fails validation as-is, so an untouched file cannot create sample data", async () => {
    const { buildMigrationTemplate } = await import("@/lib/migration/template");
    const { readWorkbook } = await import("@/lib/xlsx/read-workbook");
    const wb = readWorkbook(Buffer.from(buildMigrationTemplate(), "utf8"));

    // A catalog that happens to hold the example codes would let the sample
    // rows through, so the examples use codes no catalog can contain.
    const plan = planImport(wb, EMPTY);
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.errors.some((e) => e.column === "Model Code")).toBe(true);
  });

  it("ships a Guide sheet the planner ignores", async () => {
    const { buildMigrationTemplate } = await import("@/lib/migration/template");
    const { readWorkbook } = await import("@/lib/xlsx/read-workbook");
    const wb = readWorkbook(Buffer.from(buildMigrationTemplate(), "utf8"));
    expect(Object.keys(wb)).toContain("Guide");
  });
});
