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
 * Prices / stock / cycles on a row are applied only when the entity is
 * CREATED by that row — an existing model or SKU keeps whatever it has.
 * Model on-hand is booked through `recordOpeningStock` so the StockMove
 * ledger matches the cached counter.
 *
 * MANAGER+ only.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { allocateCategoryCode } from "@/lib/products/category-code";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { logAudit } from "@/lib/audit";
import { cycleToStored } from "@/lib/catalog/cycle-unit";
import { recordOpeningStock } from "@/lib/inventory/moves";

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

function toInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Price cell → number (blank / unparsable → null). Decimals are kept. */
function toNum(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Read a cycle cell, preferring the day-based column the exporter writes and
 *  falling back to the legacy month-based one (×30 via cycleToStored). */
function readCycle(
  row: string[],
  dayIdx: number,
  monthIdx: number,
): { raw: string; days: number | null; unit: "DAY" | "MONTH" } {
  const dayRaw = dayIdx >= 0 ? (row[dayIdx] ?? "").trim() : "";
  if (dayRaw) return { raw: dayRaw, days: cycleToStored(dayRaw, "DAY"), unit: "DAY" };
  const monthRaw = monthIdx >= 0 ? (row[monthIdx] ?? "").trim() : "";
  return { raw: monthRaw, days: cycleToStored(monthRaw, "MONTH"), unit: "MONTH" };
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
    // The exporter emits day-based cycle headers; older templates said months.
    // Accept both so a file from either generation imports its cycles.
    const cReplaceDays = idx("replace every (days)");
    const cReplaceMonths = idx("replace every (months)");
    const cCleanDays = idx("clean every (days)");
    const cCleanMonths = idx("clean every (months)");
    const cMinor = idx("minor part");
    const cOnHand = idx("on hand");
    const cSafety = idx("safety stock");
    const cSalePrice = idx("sale price (vnd)");
    const cRetailPrice = idx("retail price (vnd)");
    const cPurchasePrice = idx("purchase price (vnd)");
    const cDealerPrice = idx("dealer price (vnd)");

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
              // Rows are created one at a time, so a code minted earlier in
              // this same upload is already visible to the lookup.
              const code = await allocateCategoryCode(
                catEn,
                async (candidate) =>
                  (await prisma.productCategory.findUnique({
                    where: { code: candidate },
                    select: { id: true },
                  })) !== null,
              );
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
                  salePrice: toNum(row[cSalePrice]),
                  retailPrice: toNum(row[cRetailPrice]),
                  purchasePrice: toNum(row[cPurchasePrice]),
                  fixedPrice: toNum(row[cDealerPrice]),
                  safetyStock: toInt(row[cSafety]) ?? 0,
                },
                select: { id: true },
              });
              id = created.id;
              // Opening on-hand goes through the ledger so StockMove history
              // and the cached counter agree (same rule as the model form).
              await recordOpeningStock(prisma, {
                itemKind: "MODEL",
                equipmentModelId: id,
                qty: toInt(row[cOnHand]) ?? 0,
                createdById: auth.userId,
              });
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
            const replace = readCycle(row, cReplaceDays, cReplaceMonths);
            const clean = readCycle(row, cCleanDays, cCleanMonths);
            const cleanOnEveryVisit = clean.raw.toLowerCase() === "every visit";
            const cleanEveryDays = cleanOnEveryVisit ? null : clean.days;
            if (replace.days == null && cleanEveryDays == null && !cleanOnEveryVisit) {
              summary.warnings.push(
                `Row ${r + 2}: ${partSku} has no replace/clean cycle — it will never be scheduled`,
              );
            }
            const created = await prisma.consumable.create({
              data: {
                sku: partSku,
                nameEn: partNameEn,
                nameKo: partNameKo,
                nameVi: partNameVi,
                replaceEveryDays: replace.days,
                replaceCycleUnit: replace.unit,
                cleanEveryDays,
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

    // Every row above is written straight through Prisma, so without this the
    // whole upload — dozens of brands / 제품군 / models — lands in the database
    // with no audit trail at all. One row per upload, flattened because the
    // diff table is a shallow key/value view: nested objects would render as
    // raw JSON. Names (not just counts) so "where did this brand come from?"
    // is answerable from the log alone.
    const names = (items: string[]) => (items.length > 0 ? items.join(", ") : null);
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CATALOG_IMPORT",
      entityType: "CatalogImport",
      entityId: null,
      after: {
        fileName: file.name,
        rowsProcessed: summary.rowsProcessed,
        brandsCreated: summary.brandsCreated,
        categoriesCreated: summary.categoriesCreated,
        modelsCreated: summary.modelsCreated,
        consumablesCreated: summary.consumablesCreated,
        accessoriesCreated: summary.accessoriesCreated,
        linksCreated: summary.linksCreated,
        duplicatesSkipped:
          summary.duplicates.brands +
          summary.duplicates.categories +
          summary.duplicates.models +
          summary.duplicates.consumables +
          summary.duplicates.accessories +
          summary.duplicates.links,
        newBrands: names(summary.newItems.brands),
        newCategories: names(summary.newItems.categories),
        newModels: names(summary.newItems.models),
        newConsumables: names(summary.newItems.consumables),
        newAccessories: names(summary.newItems.accessories),
        warnings: summary.warnings.length > 0 ? summary.warnings.join(" | ") : null,
      },
      request,
    });

    return successResponse(summary);
  } catch (err) {
    return toErrorResponse(err);
  }
}
