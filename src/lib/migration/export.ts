/**
 * Bulk export — the same workbook the importer reads, filled with live data.
 *
 * Same five sheets, same headers, same column order as the template, so a
 * downloaded file can be edited and handed straight back to the import
 * screen. That is what makes this more than a report: it is the correction
 * loop for a migration that has already landed, and the backup you take
 * before a second one.
 *
 * The identifier columns carry the customer's own code when there is one and
 * our generated code otherwise, and the importer treats either as "already
 * here" — so re-uploading an export skips every row instead of duplicating
 * the database into itself.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { buildSpreadsheetML, type XlsxSheet } from "@/lib/xlsx/spreadsheet-ml";
import { HEADERS, SHEETS } from "@/lib/migration/plan";

/**
 * The Equipment sheet's join key.
 *
 * An asset code alone is not unique: the sequence runs per model, so three
 * different units legitimately carry `MAY-000001`. Pairing it with the model
 * code gives the same uniqueness the database enforces, and stays readable
 * enough for someone matching a consumable row to its unit by eye.
 */
export function equipmentKey(
  modelCode: string | null,
  assetCode: string,
): string {
  return `${modelCode ?? "OFF-CATALOG"}|${assetCode}`.toLowerCase();
}

/** `YYYY-MM-DD` in VST, matching what the importer parses. */
function day(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function money(v: { toString(): string } | null | undefined): string {
  if (v === null || v === undefined) return "";
  const n = Number(v.toString());
  return Number.isFinite(n) ? String(n) : "";
}

export interface ExportFilter {
  /** Limit to one customer; omitted means every customer. */
  customerId?: string;
}

export async function buildMigrationExport(
  prisma: PrismaClient,
  filter: ExportFilter = {},
): Promise<string> {
  const where = filter.customerId ? { id: filter.customerId } : {};

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      legacyCode: true,
      name: true,
      type: true,
      shortcode: true,
      taxCode: true,
      addressProvinceName: true,
      addressWardName: true,
      addressStreet: true,
      contacts: {
        where: { role: "CONTRACT_PARTY" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { name: true, phone1: true, email: true, language: true },
      },
    },
  });

  const customerKey = new Map(
    customers.map((c) => [c.id, c.legacyCode || c.code]),
  );

  const contracts = await prisma.contract.findMany({
    where: filter.customerId ? { customerId: filter.customerId } : {},
    orderBy: { contractNumber: "asc" },
    select: {
      id: true,
      contractNumber: true,
      legacyContractNumber: true,
      customerId: true,
      type: true,
      startDate: true,
      termMonths: true,
      monthlyMaintenanceFee: true,
      deposit: true,
      totalContractValue: true,
      notes: true,
    },
  });

  const contractKey = new Map(
    contracts.map((k) => [k.id, k.legacyContractNumber || k.contractNumber]),
  );

  const equipment = await prisma.equipment.findMany({
    where: filter.customerId ? { customerId: filter.customerId } : {},
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assetCode: true,
      customerId: true,
      serialNumber: true,
      installedAt: true,
      serviceType: true,
      managementType: true,
      monthlyFee: true,
      customInspectionCycleDays: true,
      customDescription: true,
      notes: true,
      model: { select: { modelCode: true } },
      contracts: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { contractId: true },
      },
      consumables: {
        orderBy: { createdAt: "asc" },
        select: {
          customName: true,
          quantity: true,
          replaceEveryDays: true,
          lastReplacedAtOverride: true,
          notes: true,
          consumable: { select: { sku: true } },
        },
      },
    },
  });

  const customerRows = customers.map((c) => [
    c.legacyCode || c.code,
    c.name,
    c.type,
    c.shortcode ?? "",
    c.taxCode ?? "",
    c.contacts[0]?.name ?? "",
    c.contacts[0]?.phone1 ?? "",
    c.contacts[0]?.email ?? "",
    c.contacts[0]?.language ?? "vi",
    c.addressProvinceName ?? "",
    c.addressWardName ?? "",
    c.addressStreet ?? "",
  ]);

  const contractRows = contracts.map((k) => [
    k.legacyContractNumber || k.contractNumber,
    customerKey.get(k.customerId) ?? "",
    k.type,
    day(k.startDate),
    k.termMonths === null ? "" : String(k.termMonths),
    money(k.monthlyMaintenanceFee),
    money(k.deposit),
    money(k.totalContractValue),
    k.notes ?? "",
  ]);

  const keyOf = (e: { assetCode: string | null; id: string; model: { modelCode: string | null } | null }) =>
    equipmentKey(e.model?.modelCode ?? null, e.assetCode ?? e.id);

  const equipmentRows = equipment.map((e) => [
    keyOf(e),
    customerKey.get(e.customerId) ?? "",
    e.contracts[0] ? (contractKey.get(e.contracts[0].contractId) ?? "") : "",
    e.model?.modelCode ?? "",
    e.customDescription ?? "",
    e.serialNumber ?? "",
    day(e.installedAt),
    e.serviceType ?? "",
    e.managementType ?? "",
    money(e.monthlyFee),
    e.customInspectionCycleDays === null ? "" : String(e.customInspectionCycleDays),
    e.notes ?? "",
  ]);

  const consumableRows = equipment.flatMap((e) =>
    e.consumables.map((c) => [
      keyOf(e),
      c.consumable?.sku ?? "",
      c.consumable ? "" : (c.customName ?? ""),
      String(c.quantity),
      c.replaceEveryDays === null ? "" : String(c.replaceEveryDays),
      day(c.lastReplacedAtOverride),
      c.notes ?? "",
    ]),
  );

  const sheets: XlsxSheet[] = [
    { name: SHEETS.customers, headers: HEADERS.customers, rows: customerRows },
    { name: SHEETS.contracts, headers: HEADERS.contracts, rows: contractRows },
    { name: SHEETS.equipment, headers: HEADERS.equipment, rows: equipmentRows },
    { name: SHEETS.consumables, headers: HEADERS.consumables, rows: consumableRows },
  ];
  return buildSpreadsheetML(sheets);
}
