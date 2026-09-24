/**
 * Migration workbook → import plan.
 *
 * Pure: takes the parsed sheets plus a snapshot of what already exists, and
 * returns the rows to create together with every problem found. No database
 * access, so the whole validation surface is testable without a schema, and
 * the preview step and the commit step run the exact same code — a preview
 * that says "12 customers, no errors" cannot disagree with what commit does.
 *
 * Sheet names and headers are English to match the existing catalog
 * import/export pair; the template ships a Guide sheet that explains each
 * column in Korean and Vietnamese.
 */

import type { SheetRows } from "@/lib/xlsx/read-workbook";
import { sheetToRecords } from "@/lib/xlsx/read-workbook";

export const SHEETS = {
  customers: "Customers",
  contracts: "Contracts",
  equipment: "Equipment",
  consumables: "Consumables",
} as const;

export const HEADERS = {
  customers: [
    "Customer Code",
    "Name",
    "Type",
    "Shortcode",
    "Tax Code",
    "Contact Name",
    "Contact Phone",
    "Contact Email",
    "Language",
    "Province",
    "Ward",
    "Street",
  ],
  contracts: [
    "Contract No",
    "Customer Code",
    "Type",
    "Start Date",
    "Term Months",
    "Monthly Fee",
    "Deposit",
    "Total Value",
    "Notes",
  ],
  equipment: [
    "Equipment Key",
    "Customer Code",
    "Contract No",
    "Model Code",
    "Custom Description",
    "Serial",
    "Installed Date",
    "Service Type",
    "Management Type",
    "Monthly Fee",
    "Inspection Cycle Days",
    "Notes",
  ],
  consumables: [
    "Equipment Key",
    "Consumable SKU",
    "Custom Name",
    "Quantity",
    "Replace Every Days",
    "Last Replaced Date",
    "Notes",
  ],
} as const;

export type CustomerType = "B2C" | "B2B";
export type ContractType = "SALE" | "RENTAL" | "MAINTENANCE";
export type ServiceType = "RENTAL" | "MAINTENANCE" | "SALE";
export type ManagementType = "FULL_SERVICE" | "SELF_MANAGED" | "OTHER";

export interface PlannedCustomer {
  legacyCode: string;
  name: string;
  type: CustomerType;
  shortcode: string | null;
  taxCode: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  language: "ko" | "vi" | "en";
  provinceName: string | null;
  wardName: string | null;
  street: string | null;
}

export interface PlannedContract {
  legacyContractNumber: string;
  customerLegacyCode: string;
  type: ContractType;
  startDate: string;
  termMonths: number | null;
  monthlyFee: number | null;
  deposit: number | null;
  totalValue: number | null;
  notes: string | null;
}

export interface PlannedEquipment {
  key: string;
  customerLegacyCode: string;
  contractLegacyNumber: string | null;
  /** Empty for an off-catalog unit, which carries `customDescription` instead. */
  modelCode: string;
  customDescription: string | null;
  serial: string | null;
  installedDate: string;
  serviceType: ServiceType;
  managementType: ManagementType;
  monthlyFee: number | null;
  inspectionCycleDays: number | null;
  notes: string | null;
  consumables: PlannedConsumable[];
}

export interface PlannedConsumable {
  equipmentKey: string;
  sku: string | null;
  customName: string | null;
  quantity: number;
  replaceEveryDays: number | null;
  lastReplacedDate: string | null;
  notes: string | null;
}

export interface RowIssue {
  sheet: string;
  /** 1-based row number as the operator sees it in Excel, header included. */
  row: number;
  column: string | null;
  message: string;
}

export interface ImportPlan {
  customers: PlannedCustomer[];
  contracts: PlannedContract[];
  equipment: PlannedEquipment[];
  /** Rows skipped because the code already exists in the database. */
  skipped: { customers: number; contracts: number; equipment: number };
  errors: RowIssue[];
}

/** What the caller must look up before planning. */
export interface ExistingSnapshot {
  /** Lowercased legacy customer codes already in the database. */
  customerLegacyCodes: Set<string>;
  /** Lowercased legacy contract numbers already in the database. */
  contractLegacyNumbers: Set<string>;
  /** Catalog model codes, lowercased → id. */
  modelCodes: Map<string, string>;
  /** Catalog consumable SKUs, lowercased → id. */
  consumableSkus: Map<string, string>;
  /** Existing `(modelCode|serial)` pairs, lowercased, to catch re-imports. */
  equipmentSerials: Set<string>;
  /**
   * Existing equipment keys as the exporter writes them — `modelCode|assetCode`,
   * lowercased. Asset codes are a per-model sequence, so the model has to be
   * part of the key: three different units all legitimately carry
   * `MAY-000001`. This is what lets an exported workbook be re-uploaded
   * unchanged, including units that have no serial number.
   */
  equipmentKeys: Set<string>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(raw: string): number | null {
  if (!raw) return null;
  // Vietnamese spreadsheets write 1.500.000; strip separators, keep a decimal
  // comma only when it is clearly the last group.
  const cleaned = raw.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function int(raw: string): number | null {
  const n = num(raw);
  return n === null ? null : Math.trunc(n);
}

function blankToNull(raw: string): string | null {
  const t = raw.trim();
  return t === "" ? null : t;
}

/**
 * Excel renders a date cell as a serial number when the column is formatted as
 * a date, so accept both that and `YYYY-MM-DD`. Anything else is an error the
 * operator has to fix — guessing between `03/04` day-first and month-first is
 * exactly the kind of silent corruption a migration must not do.
 */
function parseDate(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  if (DATE_RE.test(t)) return t;
  if (/^\d{5}$/.test(t)) {
    // Excel serial: day 1 is 1900-01-01, with the well-known 1900 leap bug.
    const ms = (Number(t) - 25569) * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function isoIsValid(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

interface Ctx {
  errors: RowIssue[];
  sheet: string;
}

function err(ctx: Ctx, row: number, column: string | null, message: string): void {
  ctx.errors.push({ sheet: ctx.sheet, row, column, message });
}

function requireOneOf<T extends string>(
  ctx: Ctx,
  row: number,
  column: string,
  raw: string,
  allowed: readonly T[],
  fallback?: T,
): T | null {
  const v = raw.trim().toUpperCase();
  if (v === "") {
    if (fallback) return fallback;
    err(ctx, row, column, "required");
    return null;
  }
  if (!(allowed as readonly string[]).includes(v)) {
    err(ctx, row, column, `must be one of ${allowed.join(" / ")}`);
    return null;
  }
  return v as T;
}

export function planImport(
  sheets: Record<string, SheetRows>,
  existing: ExistingSnapshot,
): ImportPlan {
  const errors: RowIssue[] = [];
  const skipped = { customers: 0, contracts: 0, equipment: 0 };

  for (const name of Object.values(SHEETS)) {
    if (!sheets[name]) {
      errors.push({
        sheet: name,
        row: 0,
        column: null,
        message: "sheet is missing from the workbook",
      });
    }
  }
  if (errors.length > 0) {
    return { customers: [], contracts: [], equipment: [], skipped, errors };
  }

  // ── Customers ────────────────────────────────────────────────────────
  const cctx: Ctx = { errors, sheet: SHEETS.customers };
  const customers: PlannedCustomer[] = [];
  const customerCodes = new Set<string>();

  sheetToRecords(sheets[SHEETS.customers]).forEach((r, i) => {
    const row = i + 2;
    const code = r["Customer Code"] ?? "";
    if (!code) {
      err(cctx, row, "Customer Code", "required");
      return;
    }
    const key = code.toLowerCase();
    if (customerCodes.has(key)) {
      err(cctx, row, "Customer Code", "duplicated inside the file");
      return;
    }
    customerCodes.add(key);

    if (existing.customerLegacyCodes.has(key)) {
      skipped.customers += 1;
      return;
    }

    const type = requireOneOf(cctx, row, "Type", r["Type"] ?? "", ["B2C", "B2B"] as const);
    const name = (r["Name"] ?? "").trim();
    if (!name) err(cctx, row, "Name", "required");
    const contactName = (r["Contact Name"] ?? "").trim();
    if (!contactName) err(cctx, row, "Contact Name", "required");
    const contactPhone = (r["Contact Phone"] ?? "").trim();
    if (!contactPhone) err(cctx, row, "Contact Phone", "required");
    const shortcode = blankToNull(r["Shortcode"] ?? "");
    if (type === "B2B" && !shortcode) {
      err(cctx, row, "Shortcode", "required for B2B — the contract code is built from it");
    }
    const language = requireOneOf(
      cctx,
      row,
      "Language",
      r["Language"] ?? "",
      ["KO", "VI", "EN"] as const,
      "VI",
    );

    if (!type || !name || !contactName || !contactPhone || !language) return;

    customers.push({
      legacyCode: code,
      name,
      type,
      shortcode,
      taxCode: blankToNull(r["Tax Code"] ?? ""),
      contactName,
      contactPhone,
      contactEmail: blankToNull(r["Contact Email"] ?? ""),
      language: language.toLowerCase() as "ko" | "vi" | "en",
      provinceName: blankToNull(r["Province"] ?? ""),
      wardName: blankToNull(r["Ward"] ?? ""),
      street: blankToNull(r["Street"] ?? ""),
    });
  });

  /** Codes usable as a foreign key: planned now, or already in the database. */
  const knownCustomer = (code: string): boolean =>
    customerCodes.has(code.toLowerCase()) ||
    existing.customerLegacyCodes.has(code.toLowerCase());

  // ── Contracts ────────────────────────────────────────────────────────
  const ktx: Ctx = { errors, sheet: SHEETS.contracts };
  const contracts: PlannedContract[] = [];
  const contractNumbers = new Set<string>();

  sheetToRecords(sheets[SHEETS.contracts]).forEach((r, i) => {
    const row = i + 2;
    const no = (r["Contract No"] ?? "").trim();
    if (!no) {
      err(ktx, row, "Contract No", "required");
      return;
    }
    const key = no.toLowerCase();
    if (contractNumbers.has(key)) {
      err(ktx, row, "Contract No", "duplicated inside the file");
      return;
    }
    contractNumbers.add(key);

    if (existing.contractLegacyNumbers.has(key)) {
      skipped.contracts += 1;
      return;
    }

    const customerCode = (r["Customer Code"] ?? "").trim();
    if (!customerCode) err(ktx, row, "Customer Code", "required");
    else if (!knownCustomer(customerCode)) {
      err(ktx, row, "Customer Code", "no such customer in the Customers sheet or the database");
    }

    const type = requireOneOf(ktx, row, "Type", r["Type"] ?? "", [
      "SALE",
      "RENTAL",
      "MAINTENANCE",
    ] as const);

    const startRaw = r["Start Date"] ?? "";
    const startDate = parseDate(startRaw);
    if (!startDate) err(ktx, row, "Start Date", "required, format YYYY-MM-DD");
    else if (!isoIsValid(startDate)) err(ktx, row, "Start Date", "not a real date");

    const termMonths = int(r["Term Months"] ?? "");
    if (type === "RENTAL" && (termMonths === null || termMonths <= 0)) {
      err(ktx, row, "Term Months", "required for RENTAL");
    }

    if (!customerCode || !type || !startDate) return;

    contracts.push({
      legacyContractNumber: no,
      customerLegacyCode: customerCode,
      type,
      startDate,
      termMonths,
      monthlyFee: num(r["Monthly Fee"] ?? ""),
      deposit: num(r["Deposit"] ?? ""),
      totalValue: num(r["Total Value"] ?? ""),
      notes: blankToNull(r["Notes"] ?? ""),
    });
  });

  const knownContract = (no: string): boolean =>
    contractNumbers.has(no.toLowerCase()) ||
    existing.contractLegacyNumbers.has(no.toLowerCase());

  // ── Equipment ────────────────────────────────────────────────────────
  const etx: Ctx = { errors, sheet: SHEETS.equipment };
  const equipment: PlannedEquipment[] = [];
  const equipmentKeys = new Map<string, PlannedEquipment>();
  // Keys whose equipment was skipped as already imported. Their consumable
  // rows are not errors — they belong to a unit that is already in, so they
  // are skipped in turn. Without this, re-uploading a finished workbook
  // reports one error per consumable instead of "nothing to do".
  const skippedEquipmentKeys = new Set<string>();

  sheetToRecords(sheets[SHEETS.equipment]).forEach((r, i) => {
    const row = i + 2;
    const key = (r["Equipment Key"] ?? "").trim();
    if (!key) {
      err(etx, row, "Equipment Key", "required — the Consumables sheet refers to it");
      return;
    }
    if (equipmentKeys.has(key.toLowerCase())) {
      err(etx, row, "Equipment Key", "duplicated inside the file");
      return;
    }

    const customerCode = (r["Customer Code"] ?? "").trim();
    if (!customerCode) err(etx, row, "Customer Code", "required");
    else if (!knownCustomer(customerCode)) {
      err(etx, row, "Customer Code", "no such customer in the Customers sheet or the database");
    }

    const contractNo = blankToNull(r["Contract No"] ?? "");
    if (contractNo && !knownContract(contractNo)) {
      err(etx, row, "Contract No", "no such contract in the Contracts sheet or the database");
    }

    // An already-imported unit is recognised by its key first — that is what
    // an export writes, and it works for units with no serial number.
    if (existing.equipmentKeys.has(key.toLowerCase())) {
      skipped.equipment += 1;
      skippedEquipmentKeys.add(key.toLowerCase());
      return;
    }

    const modelCode = (r["Model Code"] ?? "").trim();
    const customDescription = blankToNull(r["Custom Description"] ?? "");
    if (!modelCode && !customDescription) {
      err(
        etx,
        row,
        "Model Code",
        "required — or give a Custom Description for a unit that is not in the catalog",
      );
    } else if (modelCode && !existing.modelCodes.has(modelCode.toLowerCase())) {
      err(etx, row, "Model Code", "not in the product catalog — register the model first");
    }

    const serial = blankToNull(r["Serial"] ?? "");
    if (serial && modelCode) {
      const pair = `${modelCode.toLowerCase()}|${serial.toLowerCase()}`;
      if (existing.equipmentSerials.has(pair)) {
        skipped.equipment += 1;
        skippedEquipmentKeys.add(key.toLowerCase());
        return;
      }
    }

    const installedDate = parseDate(r["Installed Date"] ?? "");
    if (!installedDate) err(etx, row, "Installed Date", "required, format YYYY-MM-DD");
    else if (!isoIsValid(installedDate)) err(etx, row, "Installed Date", "not a real date");

    const serviceType = requireOneOf(etx, row, "Service Type", r["Service Type"] ?? "", [
      "RENTAL",
      "MAINTENANCE",
      "SALE",
    ] as const);
    const managementType = requireOneOf(
      etx,
      row,
      "Management Type",
      r["Management Type"] ?? "",
      ["FULL_SERVICE", "SELF_MANAGED", "OTHER"] as const,
      "FULL_SERVICE",
    );

    if (
      !customerCode ||
      (!modelCode && !customDescription) ||
      !installedDate ||
      !serviceType ||
      !managementType
    ) {
      return;
    }

    const planned: PlannedEquipment = {
      key,
      customerLegacyCode: customerCode,
      contractLegacyNumber: contractNo,
      modelCode,
      customDescription: modelCode ? null : customDescription,
      serial,
      installedDate,
      serviceType,
      managementType,
      monthlyFee: num(r["Monthly Fee"] ?? ""),
      inspectionCycleDays: int(r["Inspection Cycle Days"] ?? ""),
      notes: blankToNull(r["Notes"] ?? ""),
      consumables: [],
    };
    equipmentKeys.set(key.toLowerCase(), planned);
    equipment.push(planned);
  });

  // ── Consumables ──────────────────────────────────────────────────────
  const ctx: Ctx = { errors, sheet: SHEETS.consumables };

  sheetToRecords(sheets[SHEETS.consumables]).forEach((r, i) => {
    const row = i + 2;
    const key = (r["Equipment Key"] ?? "").trim();
    if (!key) {
      err(ctx, row, "Equipment Key", "required");
      return;
    }
    const target = equipmentKeys.get(key.toLowerCase());
    if (!target) {
      if (skippedEquipmentKeys.has(key.toLowerCase())) return;
      err(ctx, row, "Equipment Key", "no such key in the Equipment sheet");
      return;
    }

    const sku = blankToNull(r["Consumable SKU"] ?? "");
    const customName = blankToNull(r["Custom Name"] ?? "");
    if (!sku && !customName) {
      err(ctx, row, "Consumable SKU", "give either a catalog SKU or a custom name");
      return;
    }
    if (sku && !existing.consumableSkus.has(sku.toLowerCase())) {
      err(ctx, row, "Consumable SKU", "not in the product catalog");
      return;
    }

    const lastReplacedRaw = r["Last Replaced Date"] ?? "";
    const lastReplaced = parseDate(lastReplacedRaw);
    if (lastReplacedRaw.trim() !== "" && !lastReplaced) {
      err(ctx, row, "Last Replaced Date", "format YYYY-MM-DD");
      return;
    }

    const quantity = int(r["Quantity"] ?? "") ?? 1;
    if (quantity <= 0) {
      err(ctx, row, "Quantity", "must be 1 or more");
      return;
    }

    target.consumables.push({
      equipmentKey: target.key,
      sku,
      customName: sku ? null : customName,
      quantity,
      replaceEveryDays: int(r["Replace Every Days"] ?? ""),
      lastReplacedDate: lastReplaced,
      notes: blankToNull(r["Notes"] ?? ""),
    });
  });

  return { customers, contracts, equipment, skipped, errors };
}
