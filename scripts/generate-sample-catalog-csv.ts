/**
 * Generates `docs/sample_catalog_for_upload.csv` — 240+ rows of brand /
 * category / model / consumable / accessory data that does NOT collide with
 * the existing seed.  Used to demo / smoke-test the
 * `POST /api/admin/products/import-catalog` endpoint.
 *
 *   npx tsx scripts/generate-sample-catalog-csv.ts
 *
 * Re-running overwrites the file deterministically.
 */

import fs from "node:fs";
import path from "node:path";

const NEW_BRANDS = [
  "Aqualife",
  "WaterMax",
  "PureFlow",
  "VietPure",
  "EcoFilter",
  "HydraTech",
  "AquaPro",
  "BlueWave",
  "NovaPure",
  "ClearStream",
];

/** Tuples are [EN, KO, VI]. Names intentionally don't overlap with seeded
 *  product categories (Air purifier, Hot/Cold water purifier, etc.). */
const NEW_CATEGORIES: Array<[string, string, string]> = [
  ["Under-sink purifier", "싱크대 정수기", "Máy lọc dưới bồn rửa"],
  ["Whole-house filter", "전체 가정용 필터", "Bộ lọc cả nhà"],
  ["Shower head filter", "샤워헤드 필터", "Lọc đầu vòi sen"],
  ["Travel purifier", "휴대용 정수기", "Máy lọc du lịch"],
  ["Outdoor camping purifier", "캠핑용 정수기", "Máy lọc cắm trại"],
  ["Pet water dispenser", "반려동물 음수기", "Máy nước cho thú cưng"],
  ["Mineral water dispenser", "미네랄 정수기", "Máy lọc khoáng"],
  ["Commercial filtration", "상업용 정수", "Lọc nước thương mại"],
  ["Refrigerator water line", "냉장고 정수 라인", "Đường nước tủ lạnh"],
  ["Faucet filter", "수도꼭지 필터", "Lọc tại vòi"],
];

interface ConsumableTmpl {
  sku: string;
  en: string;
  ko: string;
  vi: string;
  qty: number;
  replace: number | "";
  clean: string; // "" or "every visit" or number
}
const CONSUMABLE_TMPLS: ConsumableTmpl[] = [
  { sku: "PP10",     en: 'PP 10"',                ko: 'PP 10" 침전 필터',         vi: 'Lõi PP 10"',                qty: 1, replace: 6,   clean: "" },
  { sku: "CTO10",    en: 'CTO 10"',               ko: 'CTO 10" 카본 필터',        vi: 'Lõi carbon CTO 10"',         qty: 1, replace: 12,  clean: "" },
  { sku: "UF10",     en: 'UF 10" Membrane',       ko: 'UF 10" 멤브레인',          vi: 'Màng UF 10"',                qty: 1, replace: 24,  clean: "" },
  { sku: "RO75",     en: "RO 75GPD Membrane",     ko: "RO 75GPD 멤브레인",        vi: "Màng RO 75GPD",              qty: 1, replace: 24,  clean: "" },
  { sku: "RO100",    en: "RO 100GPD Membrane",    ko: "RO 100GPD 멤브레인",       vi: "Màng RO 100GPD",             qty: 1, replace: 24,  clean: "" },
  { sku: "POSTCARB", en: "Post carbon polisher",  ko: "포스트 카본 필터",         vi: "Lõi carbon hậu lọc",         qty: 1, replace: 18,  clean: "" },
  { sku: "MINERAL",  en: "Mineral cartridge",     ko: "미네랄 카트리지",          vi: "Hộp khoáng bổ sung",         qty: 1, replace: 12,  clean: "" },
  { sku: "PRE",      en: "Pre-mesh filter",       ko: "프리메쉬 필터",            vi: "Lõi tiền lọc lưới",          qty: 1, replace: "",  clean: "every visit" },
  { sku: "BIRM",     en: "Birm sediment media",   ko: "비름 침전 미디어",         vi: "Vật liệu Birm",              qty: 1, replace: 36,  clean: "" },
  { sku: "GAC",      en: "Granular activated carbon", ko: "입상활성탄",           vi: "Than hoạt tính dạng hạt",   qty: 1, replace: 24,  clean: "" },
];

interface AccessoryTmpl {
  sku: string;
  en: string;
  ko: string;
  vi: string;
  minor: "Y" | "N";
}
const ACCESSORY_TMPLS: AccessoryTmpl[] = [
  { sku: "FCT",   en: "Goose-neck faucet",     ko: "구즈넥 수전",          vi: "Vòi cổ ngỗng",                minor: "N" },
  { sku: "TANK",  en: "3.2 gal pressure tank", ko: "3.2갤런 압력 탱크",    vi: "Bình áp 3.2 gal",             minor: "N" },
  { sku: "HOSE1", en: "Tubing 1m (white)",     ko: "튜브 호스 1m (흰색)",  vi: "Ống 1m (trắng)",              minor: "Y" },
  { sku: "QC",    en: "Quick-connect fitting", ko: "퀵 커넥트 피팅",       vi: "Khớp nối nhanh",              minor: "Y" },
  { sku: "VALVE", en: "Inlet shut-off valve",  ko: "급수 차단 밸브",       vi: "Van khóa cấp",                minor: "Y" },
  { sku: "CLAMP", en: "Saddle clamp",          ko: "새들 클램프",          vi: "Kẹp yên ngựa",                minor: "Y" },
  { sku: "BRKT",  en: "Wall mount bracket",    ko: "벽 부착 브래킷",       vi: "Giá treo tường",              minor: "Y" },
  { sku: "UV",    en: "UV sterilizer add-on",  ko: "UV 살균 어드온",       vi: "Bộ tiệt trùng UV",            minor: "N" },
];

const HEADERS = [
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

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
function csvRow(cells: ReadonlyArray<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

function brandPrefix(name: string): string {
  return name.slice(0, 3).toUpperCase();
}
function catAbbr(en: string): string {
  return en.split(/[\s-]+/).slice(0, 2).map((w) => w.slice(0, 2).toUpperCase()).join("");
}

// Generate rows ──────────────────────────────────────────────────────────────
const lines: string[] = [csvRow(HEADERS)];
let no = 0;

// 10 brands × 4 categories × 3 models × (3 consumables + 1 accessory) = 480 rows
for (let b = 0; b < NEW_BRANDS.length; b++) {
  const brand = NEW_BRANDS[b];
  for (let c = 0; c < 4; c++) {
    const cat = NEW_CATEGORIES[(b * 7 + c * 3) % NEW_CATEGORIES.length];
    for (let m = 0; m < 3; m++) {
      const modelCode = `${brandPrefix(brand)}-${catAbbr(cat[0])}-${String((b * 100) + (c * 10) + (m + 1)).padStart(4, "0")}`;
      // Per-model product names — same code repeated across all locales, matching
      // PDF convention used elsewhere in the catalog.
      const pEn = modelCode;
      const pKo = modelCode;
      const pVi = modelCode;

      // 3 distinct consumables per model
      for (let p = 0; p < 3; p++) {
        const t = CONSUMABLE_TMPLS[(b + c + m * 3 + p) % CONSUMABLE_TMPLS.length];
        no++;
        lines.push(
          csvRow([
            no,
            brand,
            cat[0], cat[1], cat[2],
            modelCode,
            pEn, pKo, pVi,
            "Consumable",
            `${modelCode}-${t.sku}`,
            t.en, t.ko, t.vi,
            t.qty,
            t.replace,
            t.clean,
            "",
          ]),
        );
      }
      // 1 accessory per model
      const a = ACCESSORY_TMPLS[(b * 3 + c + m) % ACCESSORY_TMPLS.length];
      no++;
      lines.push(
        csvRow([
          no,
          brand,
          cat[0], cat[1], cat[2],
          modelCode,
          pEn, pKo, pVi,
          "Accessory",
          `${modelCode}-${a.sku}`,
          a.en, a.ko, a.vi,
          1,
          "",
          "",
          a.minor,
        ]),
      );
    }
  }
}

// UTF-8 BOM so Excel opens the file as UTF-8 on Windows.
const body = `﻿${lines.join("\r\n")}\r\n`;
const outPath = path.join(process.cwd(), "docs", "sample_catalog_for_upload.csv");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`  rows = ${no}`);
