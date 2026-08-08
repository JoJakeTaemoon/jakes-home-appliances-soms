/**
 * GET /api/admin/products/export-catalog
 *
 * Streams the full product catalog as a CSV — one row per
 * (model, consumable) pair, plus one row per model that has no consumables.
 * Designed to mirror the bilingual reference PDF shipped by the client:
 *   Brand · Category(EN/KO/VI) · Model · ProductName(EN/KO/VI)
 *   · Filter(EN/KO/VI) · Quantity · ReplaceEveryMonths · CleanEveryMonths
 *
 * MANAGER+ only — same gate as the rest of /api/admin/products/*.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { ForbiddenError } from "@/lib/api/error";
import { toErrorResponse } from "@/lib/api/response";
import { buildSpreadsheetML, type XlsxCell } from "@/lib/xlsx/spreadsheet-ml";

/** RFC 4180 cell escape — wraps in quotes when the value carries comma/quote/newline. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function csvRow(cells: ReadonlyArray<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

/** Resolve the "Clean Every" cell value for a consumable. */
function cleanCycleCell(c: {
  cleanOnEveryVisit: boolean;
  cleanEveryDays: number | null;
}): string {
  if (c.cleanOnEveryVisit) return "every visit";
  if (c.cleanEveryDays === null) return "";
  return String(c.cleanEveryDays);
}

type ModelWithParts = Awaited<ReturnType<typeof loadModelsWithParts>>[number];

async function loadModelsWithParts() {
  return prisma.equipmentModel.findMany({
    orderBy: [{ brand: { sortOrder: "asc" } }, { brand: { name: "asc" } }, { nameKo: "asc" }],
    include: {
      brand: { select: { name: true } },
      productCategory: { select: { nameEn: true, nameKo: true, nameVi: true } },
      consumables: {
        include: {
          consumable: {
            select: {
              sku: true,
              nameEn: true,
              nameKo: true,
              nameVi: true,
              replaceEveryDays: true,
              cleanEveryDays: true,
              cleanOnEveryVisit: true,
            },
          },
        },
      },
      accessories: {
        include: {
          accessory: {
            select: {
              sku: true,
              nameEn: true,
              nameKo: true,
              nameVi: true,
              isMinorPart: true,
            },
          },
        },
      },
    },
  });
}

type Cell = XlsxCell;

/** Decimal|null → number cell (blank when null). */
function priceCell(v: { toString(): string } | null | undefined): Cell {
  return v == null ? "" : Number(v);
}

/** Build the leading columns shared by every row emitted for a given model. */
function baseRowFor(model: ModelWithParts): ReadonlyArray<Cell> {
  const cat = model.productCategory;
  return [
    model.brand?.name ?? "",
    cat?.nameEn ?? "",
    cat?.nameKo ?? "",
    cat?.nameVi ?? "",
    model.modelCode ?? "",
    model.nameEn ?? "",
    model.nameKo ?? "",
    model.nameVi ?? "",
    model.stockOnHand,
    model.safetyStock,
    priceCell(model.salePrice),
    priceCell(model.retailPrice),
    priceCell(model.purchasePrice),
    priceCell(model.fixedPrice),
  ];
}

/** Emit one row (cell array) per attached part (consumable + accessory), plus a
 *  single placeholder row when a model has neither. Shared by the CSV and Excel
 *  outputs (요청 A). */
function rowsForModel(model: ModelWithParts): Cell[][] {
  const baseRow = baseRowFor(model);
  const out: Cell[][] = [];

  if (model.consumables.length === 0 && model.accessories.length === 0) {
    out.push([...baseRow, "", "", "", "", "", "", "", "", ""]);
    return out;
  }

  for (const link of model.consumables) {
    const c = link.consumable;
    out.push([
      ...baseRow,
      "Consumable",
      c.sku,
      c.nameEn,
      c.nameKo,
      c.nameVi,
      link.quantity,
      c.replaceEveryDays,
      cleanCycleCell(c),
      "",
    ]);
  }

  for (const link of model.accessories) {
    const a = link.accessory;
    out.push([
      ...baseRow,
      "Accessory",
      a.sku,
      a.nameEn,
      a.nameKo,
      a.nameVi,
      link.quantity,
      "",
      "",
      a.isMinorPart ? "Y" : "N",
    ]);
  }

  return out;
}

/** Filter-master sheet (요청 A) — the Consumable catalog on its own tab. */
const FILTER_HEADERS = [
  "No.",
  "SKU",
  "Filter Name (EN)",
  "Filter Name (KO)",
  "Filter Name (VI)",
  "Category (KO)",
  "Brand",
  "Spec",
  "Replace Every (days)",
  "Clean Every (days)",
  "On Hand",
  "Safety Stock",
  "Retail Price (VND)",
  "Purchase Price (VND)",
  "Dealer Price (VND)",
  "Active",
  "Notes",
];

async function loadFilters(): Promise<Cell[][]> {
  const rows = await prisma.consumable.findMany({
    orderBy: { sku: "asc" },
    select: {
      sku: true,
      nameEn: true,
      nameKo: true,
      nameVi: true,
      spec: true,
      replaceEveryDays: true,
      cleanEveryDays: true,
      cleanOnEveryVisit: true,
      retailPrice: true,
      purchasePrice: true,
      fixedPrice: true,
      stockOnHand: true,
      safetyStock: true,
      notes: true,
      isActive: true,
      brand: { select: { name: true } },
      productCategory: { select: { nameKo: true } },
    },
  });
  return rows.map((c, i) => [
    i + 1,
    c.sku,
    c.nameEn,
    c.nameKo,
    c.nameVi,
    c.productCategory?.nameKo ?? "",
    c.brand?.name ?? "",
    c.spec ?? "",
    c.replaceEveryDays,
    cleanCycleCell(c),
    c.stockOnHand,
    c.safetyStock,
    Number(c.retailPrice),
    priceCell(c.purchasePrice),
    priceCell(c.fixedPrice),
    c.isActive ? "Y" : "N",
    c.notes ?? "",
  ]);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }

    const models = await loadModelsWithParts();

    const headers = [
      "No.",
      "Brand",
      "Category (EN)",
      "Category (KO)",
      "Category (VI)",
      "Model Code",
      "Product Name (EN)",
      "Product Name (KO)",
      "Product Name (VI)",
      "On Hand",
      "Safety Stock",
      "Sale Price (VND)",
      "Retail Price (VND)",
      "Purchase Price (VND)",
      "Dealer Price (VND)",
      "Part Type",
      "Part SKU",
      "Part Name (EN)",
      "Part Name (KO)",
      "Part Name (VI)",
      "Quantity",
      "Replace Every (days)",
      "Clean Every (days)",
      "Minor Part",
    ];
    // Shared body rows (No. + model + part columns), reused by CSV and Excel.
    const catalogRows: Cell[][] = [];
    let seq = 0;
    for (const model of models) {
      for (const row of rowsForModel(model)) {
        seq++;
        catalogRows.push([seq, ...row]);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const format = new URL(request.url).searchParams.get("format");

    if (format === "xlsx") {
      const filters = await loadFilters();
      const xml = buildSpreadsheetML([
        { name: "Catalog", headers, rows: catalogRows },
        { name: "Filters", headers: FILTER_HEADERS, rows: filters },
      ]);
      return new NextResponse(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="seoul-aqua-product-catalog-${today}.xls"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const lines: string[] = [csvRow(headers), ...catalogRows.map(csvRow)];
    // UTF-8 BOM so Excel opens the file as UTF-8 (otherwise KR/VI characters
    // turn into mojibake on Windows).
    const body = `﻿${lines.join("\r\n")}\r\n`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="seoul-aqua-product-catalog-${today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
