/**
 * POST /api/admin/products/import-catalog
 *
 * Accepts a CSV in the same shape as `GET /export-catalog` and **additively**
 * registers any brand / category / model / consumable / accessory it hasn't
 * seen before. Nothing is ever deleted, no existing row is overwritten —
 * duplicates are silently skipped.
 *
 * Uniqueness rules (per row):
 *   - Brand               → `Brand.name`
 *   - ProductCategory     → (nameEn, nameKo, nameVi) triple
 *   - EquipmentModel      → `modelCode`; brand/category in same row attach
 *   - Consumable          → `Consumable.sku`; same-row model becomes a
 *                            ConsumableOnModel compatibility link
 *   - Accessory           → `Accessory.sku`; same-row model becomes an
 *                            AccessoryOnModel compatibility link
 *
 * MANAGER+ only.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { successResponse, toErrorResponse } from "@/lib/api/response";

interface ImportSummary {
  rowsProcessed: number;
  // Counts of newly-created entities
  brandsCreated: number;
  categoriesCreated: number;
  modelsCreated: number;
  consumablesCreated: number;
  accessoriesCreated: number;
  linksCreated: number;
  // Counts of rows where the entity already existed and was reused
  duplicates: {
    brands: number;
    categories: number;
    models: number;
    consumables: number;
    accessories: number;
    links: number;
  };
  // Identifying labels of the newly-created entities (for the upload modal)
  newItems: {
    brands: string[];
    categories: string[];   // "{nameEn} / {nameKo} / {nameVi}"
    models: string[];       // model codes
    consumables: string[];  // SKUs
    accessories: string[];  // SKUs
  };
  warnings: string[];
}

/** Minimal RFC 4180 parser. Handles quoted fields with embedded commas/quotes/newlines. */
function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(cur); cur = ""; continue; }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); cur = ""; row = [];
      continue;
    }
    if (ch === "\n") {
      row.push(cur); rows.push(row); cur = ""; row = [];
      continue;
    }
    cur += ch;
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur); rows.push(row);
  }
  return rows;
}

/** Generate an A-Z_0-9 category code from the English category name. */
function categoryCodeFromName(nameEn: string): string {
  const slug = nameEn.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "CATEGORY";
}

function toInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("Missing 'file' field in form-data");
    }

    const text = await file.text();
    const rawRows = parseCsv(text).filter((r) => r.some((c) => (c ?? "").trim() !== ""));
    if (rawRows.length < 2) {
      throw new ValidationError("CSV must contain a header row plus at least one data row");
    }
    const header = rawRows[0].map((c) => (c ?? "").trim().toLowerCase());
    const body = rawRows.slice(1);

    const idx = (name: string) => header.indexOf(name.toLowerCase());
    const cBrand = idx("brand");
    const cCatEn = idx("category (en)");
    const cCatKo = idx("category (ko)");
    const cCatVi = idx("category (vi)");
    const cModelCode = idx("model code");
    const cModelEn = idx("product name (en)");
    const cModelKo = idx("product name (ko)");
    const cModelVi = idx("product name (vi)");
    const cPartType = idx("part type");
    const cPartSku = idx("part sku");
    const cPartEn = idx("part name (en)");
    const cPartKo = idx("part name (ko)");
    const cPartVi = idx("part name (vi)");
    const cQty = idx("quantity");
    const cReplace = idx("replace every (months)");
    const cClean = idx("clean every (months)");
    const cMinor = idx("minor part");

    if ([cBrand, cCatEn, cCatKo, cCatVi, cModelCode].some((i) => i < 0)) {
      throw new ValidationError(
        "CSV missing one of required columns: Brand, Category (EN/KO/VI), Model Code",
      );
    }

    const summary: ImportSummary = {
      rowsProcessed: 0,
      brandsCreated: 0,
      categoriesCreated: 0,
      modelsCreated: 0,
      consumablesCreated: 0,
      accessoriesCreated: 0,
      linksCreated: 0,
      duplicates: {
        brands: 0,
        categories: 0,
        models: 0,
        consumables: 0,
        accessories: 0,
        links: 0,
      },
      newItems: {
        brands: [],
        categories: [],
        models: [],
        consumables: [],
        accessories: [],
      },
      warnings: [],
    };

    // In-memory caches to skip repeated DB lookups within a single upload.
    const brandCache = new Map<string, string>();
    const catCache = new Map<string, string>();
    const modelCache = new Map<string, string>();

    for (let r = 0; r < body.length; r++) {
      const row = body[r];
      summary.rowsProcessed++;
      try {
        // ── Brand ────────────────────────────────────────────────────────
        let brandId: string | null = null;
        const brandName = (row[cBrand] ?? "").trim();
        if (brandName) {
          let id = brandCache.get(brandName);
          if (id) {
            summary.duplicates.brands++;
          } else {
            const existing = await prisma.brand.findUnique({
              where: { name: brandName },
              select: { id: true },
            });
            if (existing) {
              id = existing.id;
              summary.duplicates.brands++;
            } else {
              const created = await prisma.brand.create({
                data: { name: brandName },
                select: { id: true },
              });
              id = created.id;
              summary.brandsCreated++;
              summary.newItems.brands.push(brandName);
            }
            brandCache.set(brandName, id);
          }
          brandId = id;
        }

        // ── ProductCategory ──────────────────────────────────────────────
        let categoryId: string | null = null;
        const catEn = (row[cCatEn] ?? "").trim();
        const catKo = (row[cCatKo] ?? "").trim();
        const catVi = (row[cCatVi] ?? "").trim();
        if (catEn && catKo && catVi) {
          const key = `${catEn}|||${catKo}|||${catVi}`;
          let id = catCache.get(key);
          if (id) {
            summary.duplicates.categories++;
          } else {
            const existing = await prisma.productCategory.findFirst({
              where: { nameEn: catEn, nameKo: catKo, nameVi: catVi },
              select: { id: true },
            });
            if (existing) {
              id = existing.id;
              summary.duplicates.categories++;
            } else {
              // Generate a unique code; on collision append a numeric suffix.
              let code = categoryCodeFromName(catEn);
              let suffix = 1;
              while (
                await prisma.productCategory.findUnique({
                  where: { code },
                  select: { id: true },
                })
              ) {
                code = `${categoryCodeFromName(catEn)}_${suffix++}`;
              }
              const created = await prisma.productCategory.create({
                data: { code, nameEn: catEn, nameKo: catKo, nameVi: catVi },
                select: { id: true },
              });
              id = created.id;
              summary.categoriesCreated++;
              summary.newItems.categories.push(`${catEn} / ${catKo} / ${catVi}`);
            }
            catCache.set(key, id);
          }
          categoryId = id;
        }

        // ── EquipmentModel ───────────────────────────────────────────────
        let modelId: string | null = null;
        const modelCode = (row[cModelCode] ?? "").trim();
        if (modelCode) {
          let id = modelCache.get(modelCode);
          if (id) {
            summary.duplicates.models++;
          } else {
            const existing = await prisma.equipmentModel.findUnique({
              where: { modelCode },
              select: { id: true },
            });
            if (existing) {
              id = existing.id;
              summary.duplicates.models++;
            } else {
              const created = await prisma.equipmentModel.create({
                data: {
                  modelCode,
                  nameKo: ((row[cModelKo] ?? "").trim() || modelCode),
                  nameVi: ((row[cModelVi] ?? "").trim() || modelCode),
                  nameEn: ((row[cModelEn] ?? "").trim() || modelCode),
                  brandId,
                  categoryId,
                },
                select: { id: true },
              });
              id = created.id;
              summary.modelsCreated++;
              summary.newItems.models.push(modelCode);
            }
            modelCache.set(modelCode, id);
          }
          modelId = id;
        }

        // ── Consumable / Accessory ───────────────────────────────────────
        const partType = (row[cPartType] ?? "").trim().toLowerCase();
        const partSku = (row[cPartSku] ?? "").trim();
        if (!partSku || (partType !== "consumable" && partType !== "accessory")) continue;

        const partNameEn = ((row[cPartEn] ?? "").trim() || partSku);
        const partNameKo = ((row[cPartKo] ?? "").trim() || partSku);
        const partNameVi = ((row[cPartVi] ?? "").trim() || partSku);
        const qty = (() => {
          const n = toInt(row[cQty]);
          return n && n > 0 ? n : 1;
        })();

        if (partType === "consumable") {
          let consumableId: string;
          const existing = await prisma.consumable.findUnique({
            where: { sku: partSku },
            select: { id: true },
          });
          if (existing) {
            consumableId = existing.id;
            summary.duplicates.consumables++;
          } else {
            const replaceEveryMonths = toInt(row[cReplace]);
            const cleanRaw = (row[cClean] ?? "").trim().toLowerCase();
            const cleanOnEveryVisit = cleanRaw === "every visit";
            const cleanEveryMonths = cleanOnEveryVisit ? null : toInt(row[cClean]);
            const created = await prisma.consumable.create({
              data: {
                sku: partSku,
                nameEn: partNameEn,
                nameKo: partNameKo,
                nameVi: partNameVi,
                replaceEveryMonths,
                cleanEveryMonths,
                cleanOnEveryVisit,
                retailPrice: 0,
              },
              select: { id: true },
            });
            consumableId = created.id;
            summary.consumablesCreated++;
            summary.newItems.consumables.push(partSku);
          }
          if (modelId) {
            const link = await prisma.consumableOnModel.findUnique({
              where: { consumableId_modelId: { consumableId, modelId } },
              select: { consumableId: true },
            });
            if (link) {
              summary.duplicates.links++;
            } else {
              await prisma.consumableOnModel.create({
                data: { consumableId, modelId, quantity: qty },
              });
              summary.linksCreated++;
            }
          }
        } else {
          let accessoryId: string;
          const existing = await prisma.accessory.findUnique({
            where: { sku: partSku },
            select: { id: true },
          });
          if (existing) {
            accessoryId = existing.id;
            summary.duplicates.accessories++;
          } else {
            const created = await prisma.accessory.create({
              data: {
                sku: partSku,
                nameEn: partNameEn,
                nameKo: partNameKo,
                nameVi: partNameVi,
                isMinorPart: (row[cMinor] ?? "").trim().toLowerCase() === "y",
                retailPrice: 0,
              },
              select: { id: true },
            });
            accessoryId = created.id;
            summary.accessoriesCreated++;
            summary.newItems.accessories.push(partSku);
          }
          if (modelId) {
            const link = await prisma.accessoryOnModel.findUnique({
              where: { accessoryId_modelId: { accessoryId, modelId } },
              select: { accessoryId: true },
            });
            if (link) {
              summary.duplicates.links++;
            } else {
              await prisma.accessoryOnModel.create({
                data: { accessoryId, modelId, quantity: qty },
              });
              summary.linksCreated++;
            }
          }
        }
      } catch (err) {
        summary.warnings.push(
          `Row ${r + 2}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return successResponse(summary);
  } catch (err) {
    return toErrorResponse(err);
  }
}
