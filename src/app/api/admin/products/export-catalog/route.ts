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
  cleanEveryMonths: number | null;
}): string {
  if (c.cleanOnEveryVisit) return "every visit";
  if (c.cleanEveryMonths === null) return "";
  return String(c.cleanEveryMonths);
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
              replaceEveryMonths: true,
              cleanEveryMonths: true,
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

/** Build the leading columns shared by every row emitted for a given model. */
function baseRowFor(model: ModelWithParts): ReadonlyArray<string> {
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
  ];
}

/** Emit one CSV line per attached part (consumable + accessory), plus a single
 *  placeholder row when a model has neither. */
function rowsForModel(model: ModelWithParts): string[] {
  const baseRow = baseRowFor(model);
  const out: string[] = [];

  if (model.consumables.length === 0 && model.accessories.length === 0) {
    out.push(csvRow([...baseRow, "", "", "", "", "", "", "", "", ""]));
    return out;
  }

  for (const link of model.consumables) {
    const c = link.consumable;
    out.push(
      csvRow([
        ...baseRow,
        "Consumable",
        c.sku,
        c.nameEn,
        c.nameKo,
        c.nameVi,
        link.quantity,
        c.replaceEveryMonths,
        cleanCycleCell(c),
        "",
      ]),
    );
  }

  for (const link of model.accessories) {
    const a = link.accessory;
    out.push(
      csvRow([
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
      ]),
    );
  }

  return out;
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
      "Part Type",
      "Part SKU",
      "Part Name (EN)",
      "Part Name (KO)",
      "Part Name (VI)",
      "Quantity",
      "Replace Every (months)",
      "Clean Every (months)",
      "Minor Part",
    ];
    const lines: string[] = [csvRow(headers)];
    // 1-indexed sequence over every emitted body row (per part, not per model).
    let seq = 0;
    for (const model of models) {
      for (const raw of rowsForModel(model)) {
        seq++;
        lines.push(`${csvRow([seq])},${raw}`);
      }
    }

    // UTF-8 BOM so Excel opens the file as UTF-8 (otherwise KR/VI characters
    // turn into mojibake on Windows).
    const body = `﻿${lines.join("\r\n")}\r\n`;
    const today = new Date().toISOString().slice(0, 10);

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
