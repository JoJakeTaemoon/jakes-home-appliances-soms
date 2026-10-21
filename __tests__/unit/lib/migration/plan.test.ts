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

describe("planImport — lifecycle columns", () => {
  // Cells are appended after the original twelve/nine columns, so a workbook
  // from before these columns existed still lines up.
  const INACTIVE_CUSTOMER = [...CUSTOMER, "INACTIVE", "0287654321", "legacy #8879"];
  const ENDED_CONTRACT = [...CONTRACT, "TERMINATED", "2025-06-30"];
  const RETIRED_EQUIPMENT = [...EQUIPMENT, "TERMINATED"];

  it("treats a workbook without the columns as all active", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [[...HEADERS.contracts], CONTRACT],
        [SHEETS.equipment]: [[...HEADERS.equipment], EQUIPMENT],
      }),
      EMPTY,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.customers[0]).toMatchObject({ status: "ACTIVE", contactPhone2: null, notes: null });
    expect(plan.contracts[0]).toMatchObject({ state: "ACTIVE", endDate: null });
    expect(plan.equipment[0].status).toBe("ACTIVE");
  });

  it("carries a terminated customer, contract and unit through as such", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], INACTIVE_CUSTOMER],
        [SHEETS.contracts]: [[...HEADERS.contracts], ENDED_CONTRACT],
        [SHEETS.equipment]: [[...HEADERS.equipment], RETIRED_EQUIPMENT],
      }),
      EMPTY,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.customers[0]).toMatchObject({
      status: "INACTIVE",
      contactPhone2: "0287654321",
      notes: "legacy #8879",
    });
    expect(plan.contracts[0]).toMatchObject({ state: "TERMINATED", endDate: "2025-06-30" });
    expect(plan.equipment[0].status).toBe("TERMINATED");
  });

  it("rejects a status the system does not have", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], [...CUSTOMER, "GONE"]],
        [SHEETS.contracts]: [[...HEADERS.contracts], [...CONTRACT, "PAUSED"]],
        [SHEETS.equipment]: [[...HEADERS.equipment], [...EQUIPMENT, "LOST"]],
      }),
      EMPTY,
    );
    expect(plan.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sheet: SHEETS.customers, column: "Status" }),
        expect.objectContaining({ sheet: SHEETS.contracts, column: "State" }),
        expect.objectContaining({ sheet: SHEETS.equipment, column: "Status" }),
      ]),
    );
  });

  it("refuses an end date it cannot read", () => {
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.contracts]: [[...HEADERS.contracts], [...CONTRACT, "TERMINATED", "30/06/2025"]],
      }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(expect.objectContaining({ column: "End Date" }));
  });

  it("lets a customer in without a phone, since old records often have none", () => {
    const noPhone = [...CUSTOMER];
    noPhone[6] = "";
    const plan = planImport(
      sheets({ [SHEETS.customers]: [[...HEADERS.customers], noPhone] }),
      EMPTY,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.customers[0].contactPhone).toBe("");
  });
});

describe("planImport — billing day and payment history", () => {
  const withBillingDay = (day: string) => [...CONTRACT, "", "", day];
  const PAID = ["E1", "2024-04", "2024-04-05", "300000", "VND", "CASH", "방문수금"];
  const base = {
    [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
    [SHEETS.contracts]: [[...HEADERS.contracts], CONTRACT],
    [SHEETS.equipment]: [[...HEADERS.equipment], EQUIPMENT],
  };

  it("reads the contract's billing day", () => {
    const plan = planImport(
      sheets({ ...base, [SHEETS.contracts]: [[...HEADERS.contracts], withBillingDay("25")] }),
      EMPTY,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.contracts[0].billingDay).toBe(25);
  });

  it("refuses a billing day no month has", () => {
    const plan = planImport(
      sheets({ ...base, [SHEETS.contracts]: [[...HEADERS.contracts], withBillingDay("32")] }),
      EMPTY,
    );
    expect(plan.errors).toContainEqual(expect.objectContaining({ column: "Billing Day" }));
  });

  it("does not require a Payments sheet", () => {
    const plan = planImport(sheets(base), EMPTY);
    expect(plan.errors).toEqual([]);
    expect(plan.equipment[0].payments).toEqual([]);
  });

  it("nests collected payments under their unit", () => {
    const plan = planImport(
      sheets({
        ...base,
        [SHEETS.payments]: [
          [...HEADERS.payments],
          PAID,
          ["E1", "2014-10", "2014-10-14", "17", "USD", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.equipment[0].payments).toEqual([
      { billingMonth: "2024-04", paidDate: "2024-04-05", amount: 300000, currency: "VND", method: "CASH", notes: "방문수금" },
      { billingMonth: "2014-10", paidDate: "2014-10-14", amount: 17, currency: "USD", method: "CASH", notes: null },
    ]);
  });

  it("rejects a payment it cannot place or read", () => {
    const plan = planImport(
      sheets({
        ...base,
        [SHEETS.payments]: [
          [...HEADERS.payments],
          ["E404", "2024-04", "2024-04-05", "1", "VND", "", ""],
          ["E1", "2024/04", "2024-04-05", "1", "VND", "", ""],
          ["E1", "2024-04", "2024-04-05", "0", "VND", "", ""],
          ["E1", "2024-04", "2024-04-05", "1", "KRW", "", ""],
        ],
      }),
      EMPTY,
    );
    expect(plan.errors.map((e) => e.column)).toEqual([
      "Equipment Key",
      "Billing Month",
      "Amount",
      "Currency",
    ]);
  });

  it("skips the payments of a unit that is already in", () => {
    const plan = planImport(
      sheets({ ...base, [SHEETS.payments]: [[...HEADERS.payments], PAID] }),
      { ...EMPTY, customerLegacyCodes: new Set(["kh0001"]), equipmentSerials: new Set(["pts-2100|sn-1"]) },
    );
    expect(plan.errors).toEqual([]);
    expect(plan.equipment).toHaveLength(0);
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

  it("recognises an off-catalog unit by its serial too, so it is not created twice", () => {
    const offCatalog = ["E9", "KH0001", "", "", "타사 정수기", "SN-9", "2024-03-05", "SALE", "", "", "", ""];
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.equipment]: [[...HEADERS.equipment], offCatalog],
      }),
      {
        ...EMPTY,
        customerLegacyCodes: new Set(["kh0001"]),
        // An off-catalog unit has no model to scope its serial, so the
        // customer does: `~customer|serial`.
        equipmentSerials: new Set(["~kh0001|sn-9"]),
      },
    );
    expect(plan.errors).toEqual([]);
    expect(plan.skipped.equipment).toBe(1);
  });

  it("does not mistake another customer's off-catalog unit with the same serial for this one", () => {
    // Old serials are often "1" or "-"; matching on the serial alone would
    // silently drop a different customer's unit.
    const offCatalog = ["E9", "KH0001", "", "", "타사 정수기", "1", "2024-03-05", "SALE", "", "", "", ""];
    const plan = planImport(
      sheets({
        [SHEETS.customers]: [[...HEADERS.customers], CUSTOMER],
        [SHEETS.equipment]: [[...HEADERS.equipment], offCatalog],
      }),
      { ...EMPTY, equipmentSerials: new Set(["~kh0099|1"]) },
    );
    expect(plan.skipped.equipment).toBe(0);
    expect(plan.equipment).toHaveLength(1);
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
