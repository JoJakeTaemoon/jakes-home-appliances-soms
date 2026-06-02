// Seed data for local development.
// Per CLAUDE.md: db:reset deletes everything and re-seeds — never on prod.
//
// Convention (inherited from the original seed): use `upsert` for rows that
// have a natural unique key (phone, code, modelCode, contractNumber, …) so the
// seed is re-runnable, and `create` for dependent rows that only have synthetic
// ids — those rely on `reset.ts` truncating first (the db:reset flow).
import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PW_HASH_COST = 12;

async function hash(password: string) {
  return bcrypt.hash(password, PW_HASH_COST);
}

// ─── date helpers (all relative to seed run so "today" data stays fresh) ────
const DAY_MS = 24 * 60 * 60 * 1000;
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * DAY_MS);
}
function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}
function at(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding...");

  // ─── Staff users ────────────────────────────────────────────────────
  // Uniform dev password — phone is the login key (changed 2026-05-28).
  const devPw = await hash("12341234");

  const admin = await prisma.user.upsert({
    where: { phone: "012345678" },
    update: { username: "admin", passwordHash: devPw, role: "ADMIN" },
    create: {
      username: "admin",
      phone: "012345678",
      email: "admin@seoulaqua.com.vn",
      passwordHash: devPw,
      role: "ADMIN",
    },
  });
  await prisma.user.upsert({
    where: { phone: "0123456781" },
    update: { username: "manager", passwordHash: devPw, role: "MANAGER" },
    create: {
      username: "manager",
      phone: "0123456781",
      email: "manager@seoulaqua.com.vn",
      passwordHash: devPw,
      role: "MANAGER",
    },
  });
  const staff = await prisma.user.upsert({
    where: { phone: "0123456782" },
    update: { username: "staff", passwordHash: devPw, role: "STAFF" },
    create: {
      username: "staff",
      phone: "0123456782",
      email: "staff@seoulaqua.com.vn",
      passwordHash: devPw,
      role: "STAFF",
    },
  });
  await prisma.user.upsert({
    where: { phone: "0123456785" },
    update: { username: "Trần Thị Thu", passwordHash: devPw, role: "STAFF" },
    create: {
      username: "Trần Thị Thu",
      phone: "0123456785",
      email: "thu.tran@seoulaqua.com.vn",
      passwordHash: devPw,
      role: "STAFF",
    },
  });

  // 5 technicians spread across regions so the scheduler has real candidates.
  const techSeed = [
    { username: "tech1", phone: "0123456783", region: "HCMC-D1" },
    { username: "tech2", phone: "0123456784", region: "HCMC-D7" },
    { username: "Nguyễn Văn Bình", phone: "0123456786", region: "HCMC-D3" },
    { username: "Lê Hoàng Phúc", phone: "0123456787", region: "HN-HK" },
    { username: "Phạm Quốc Anh", phone: "0123456788", region: "HCMC-D1" },
  ];
  const techs = [];
  for (const t of techSeed) {
    techs.push(
      await prisma.user.upsert({
        where: { phone: t.phone },
        update: { username: t.username, passwordHash: devPw, role: "TECHNICIAN", preferredRegion: t.region },
        create: {
          username: t.username,
          phone: t.phone,
          passwordHash: devPw,
          role: "TECHNICIAN",
          preferredRegion: t.region,
        },
      }),
    );
  }
  const [tech1, tech2, tech3, tech4] = techs;

  console.log(`  ✓ users (${2 + 2 + techs.length})`);

  // ─── Brands ───────────────────────────────────────────────────────────
  // Seoul Aqua = own products; DEWBEL + FRELLE = household water filter and
  // microbubble shower lines from the attached client catalog.
  const brandSeed = [
    { name: "Seoul Aqua", sortOrder: 10 },
    { name: "DEWBEL", sortOrder: 20 },
    { name: "FRELLE", sortOrder: 30 },
  ];
  const brandsByName = new Map<string, { id: string }>();
  for (const b of brandSeed) {
    const row = await prisma.brand.upsert({
      where: { name: b.name },
      update: { sortOrder: b.sortOrder },
      create: b,
    });
    brandsByName.set(b.name, row);
  }
  console.log(`  ✓ brands (${brandSeed.length})`);

  // ─── Product categories (multilingual) ──────────────────────────────
  // Mirror the legacy EquipmentCategory enum during the rollout — both the
  // enum column and the FK get populated so list filters keep working.
  // Categories from the attached "브랜드+제품군+모델명…" PDF.
  const catSeed = [
    { code: "WATER_PURIFIER", nameKo: "정수기", nameVi: "Máy lọc nước", nameEn: "Water purifier", sortOrder: 10 },
    { code: "HOT_COLD_PURIFIER", nameKo: "냉온정수기", nameVi: "Máy lọc nước nóng lạnh", nameEn: "Hot and cold water purifier", sortOrder: 11 },
    { code: "RO_HOT_COLD_PURIFIER", nameKo: "냉온정수기 — RO 방식", nameVi: "Máy lọc nước nóng lạnh RO", nameEn: "Hot and cold water purifier (RO)", sortOrder: 12 },
    { code: "POWERLESS_PURIFIER", nameKo: "무전원 정수기", nameVi: "Máy lọc nước không dùng điện", nameEn: "Powerless water purifier", sortOrder: 13 },
    { code: "BIDET", nameKo: "비데", nameVi: "Bồn cầu thông minh", nameEn: "Bidet", sortOrder: 20 },
    { code: "MANUAL_BIDET", nameKo: "무전원 수동 비데", nameVi: "Nắp vệ sinh thông minh không dùng điện", nameEn: "Non-powered manual bidet", sortOrder: 21 },
    { code: "AIR_PURIFIER", nameKo: "공기청정기", nameVi: "Máy lọc không khí", nameEn: "Air purifier", sortOrder: 30 },
    { code: "HOME_DEHUMIDIFIER", nameKo: "가정용 제습기", nameVi: "Máy hút ẩm gia dụng", nameEn: "Home dehumidifier", sortOrder: 31 },
    { code: "INDUSTRIAL_DEHUMIDIFIER", nameKo: "산업용 제습기", nameVi: "Máy hút ẩm công nghiệp", nameEn: "Industrial dehumidifier", sortOrder: 32 },
    { code: "ICE_MAKER", nameKo: "제빙기", nameVi: "Máy làm đá", nameEn: "Ice maker", sortOrder: 40 },
    { code: "WATER_DISPENSER", nameKo: "냉온수기", nameVi: "Máy úp bình", nameEn: "Water dispenser", sortOrder: 41 },
    { code: "MICROBUBBLE_CLEANER", nameKo: "마이크로 버블세정기", nameVi: "Máy làm sạch bong bóng siêu nhỏ", nameEn: "Micro bubble cleaner", sortOrder: 42 },
    { code: "HOUSEHOLD_FILTER", nameKo: "생활용 정수필터", nameVi: "Bộ lọc nhà bếp", nameEn: "Household water filter", sortOrder: 50 },
    { code: "FILTER", nameKo: "필터/소모품", nameVi: "Lõi lọc / Vật tư tiêu hao", nameEn: "Filter / Consumable", sortOrder: 60 },
  ];
  const categoriesByCode = new Map<string, { id: string }>();
  for (const c of catSeed) {
    const row = await prisma.productCategory.upsert({
      where: { code: c.code },
      update: { nameKo: c.nameKo, nameVi: c.nameVi, nameEn: c.nameEn, sortOrder: c.sortOrder },
      create: c,
    });
    categoriesByCode.set(c.code, row);
  }
  console.log(`  ✓ product categories (${catSeed.length})`);

  // ─── Equipment models ───────────────────────────────────────────────
  // Data-driven from the "브랜드+제품군+모델명+제품명+필터+교체주기" PDF + the
  // "정수기 부속품" PDF. Single source of truth for the catalog — to add a
  // model, just append to `modelSeed`. Categories are looked up by code,
  // brand by name. Legacy `category` enum is filled per category code
  // mapping at the bottom so existing list filters keep working.
  type ModelSeed = {
    code: string;
    name: string;
    displayKo?: string;
    displayVi?: string;
    displayEn?: string;
    brand: "Seoul Aqua" | "DEWBEL" | "FRELLE";
    category: string;                // ProductCategory.code
    inspectionEveryMonths?: number | null;
    warrantyMonths?: number;
    retailPrice?: number;
    monthlyRentalPrice?: number;
    monthlyMaintenancePrice?: number;
  };
  // EquipmentCategory enum mirror — legacy column. Anything not in the enum
  // (DEHUMIDIFIER, ICE_MAKER, MICROBUBBLE_CLEANER, etc.) falls back to
  // "OTHER" so existing filters don't break.
  const legacyCategoryByCode: Record<string, "WATER_PURIFIER" | "BIDET" | "AIR_PURIFIER" | "OTHER"> = {
    WATER_PURIFIER: "WATER_PURIFIER",
    HOT_COLD_PURIFIER: "WATER_PURIFIER",
    RO_HOT_COLD_PURIFIER: "WATER_PURIFIER",
    POWERLESS_PURIFIER: "WATER_PURIFIER",
    BIDET: "BIDET",
    MANUAL_BIDET: "BIDET",
    AIR_PURIFIER: "AIR_PURIFIER",
  };

  const modelSeed: ModelSeed[] = [
    // ── Air purifier — Seoul Aqua ────────────────────────────────────
    { code: "CA-5000W", name: "CA-5000W Air Purifier", brand: "Seoul Aqua", category: "AIR_PURIFIER", inspectionEveryMonths: 1, retailPrice: 7_200_000, monthlyRentalPrice: 320_000, monthlyMaintenancePrice: 110_000 },
    { code: "CA-7000WS/B", name: "CA-7000WS/B Air Purifier", brand: "Seoul Aqua", category: "AIR_PURIFIER", inspectionEveryMonths: 1, retailPrice: 9_800_000, monthlyRentalPrice: 380_000, monthlyMaintenancePrice: 130_000 },
    { code: "AP-3008FH", name: "AP-3008FH Air Purifier", brand: "Seoul Aqua", category: "AIR_PURIFIER", inspectionEveryMonths: 1 },
    { code: "AP-400", name: "AP-400 Air Purifier", brand: "Seoul Aqua", category: "AIR_PURIFIER", inspectionEveryMonths: 1 },
    { code: "AD-1615A", name: "AD-1615A Air Purifier", brand: "Seoul Aqua", category: "AIR_PURIFIER", inspectionEveryMonths: 1 },
    { code: "FA31-202GY", name: "FA31-202GY Air Purifier", brand: "Seoul Aqua", category: "AIR_PURIFIER", inspectionEveryMonths: 1 },
    { code: "FA41-402GY", name: "FA41-402GY Air Purifier", brand: "Seoul Aqua", category: "AIR_PURIFIER", inspectionEveryMonths: 1 },

    // ── Home dehumidifier ────────────────────────────────────────────
    { code: "DXTH120-NEK", name: "DXTH120-NEK Home Dehumidifier", brand: "Seoul Aqua", category: "HOME_DEHUMIDIFIER", inspectionEveryMonths: 3, retailPrice: 5_400_000 },
    { code: "HM-914EC", name: "HM-914EC Home Dehumidifier", brand: "Seoul Aqua", category: "HOME_DEHUMIDIFIER", inspectionEveryMonths: 3 },

    // ── Industrial dehumidifier ──────────────────────────────────────
    { code: "HDI-15000SW", name: "HDI-15000SW Industrial Dehumidifier", brand: "Seoul Aqua", category: "INDUSTRIAL_DEHUMIDIFIER", inspectionEveryMonths: 3 },
    { code: "HDI-25000SW", name: "HDI-25000SW Industrial Dehumidifier", brand: "Seoul Aqua", category: "INDUSTRIAL_DEHUMIDIFIER", inspectionEveryMonths: 3 },

    // ── Hot and cold water purifier (standard 4-filter set) ──────────
    { code: "PTS-2100", name: "PTS-2100 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1, retailPrice: 8_500_000, monthlyRentalPrice: 350_000, monthlyMaintenancePrice: 120_000 },
    { code: "PTS-2101", name: "PTS-2101 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "PTS-2200", name: "PTS-2200 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "PTS-2000", name: "PTS-2000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "PTS-3000", name: "PTS-3000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "PTS-3001", name: "PTS-3001 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "PTS-4000T", name: "PTS-4000T Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1, retailPrice: 16_500_000, monthlyRentalPrice: 620_000, monthlyMaintenancePrice: 180_000 },
    { code: "PTS-4001T", name: "PTS-4001T Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "PQ-800", name: "PQ-800 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KW-1500", name: "KW-1500 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KJ-1500", name: "KJ-1500 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KJ-2000", name: "KJ-2000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KJ-2500", name: "KJ-2500 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KJ-3000", name: "KJ-3000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KJ-4000", name: "KJ-4000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KG-5000", name: "KG-5000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "SA-5000", name: "SA-5000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "SA-7000", name: "SA-7000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "SA-8000", name: "SA-8000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "VI-1000", name: "VI-1000 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "VI-1000-04", name: "VI-1000-04 Hot/Cold Water Purifier (4-bay)", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "VI-1000-08", name: "VI-1000-08 Hot/Cold Water Purifier (8-bay)", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KH-750", name: "KH-750 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "KJ-750", name: "KJ-750 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "P-3001", name: "P-3001 Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },

    // ── Hot and cold water purifier - RO type ────────────────────────
    { code: "CHP-590R", name: "CHP-590R RO Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "RO_HOT_COLD_PURIFIER", inspectionEveryMonths: 1, retailPrice: 18_500_000, monthlyRentalPrice: 720_000, monthlyMaintenancePrice: 200_000 },
    { code: "CHP-671R", name: "CHP-671R RO Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "RO_HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },
    { code: "PTS-2100-RO", name: "PTS-2100 (RO) Hot/Cold Water Purifier", brand: "Seoul Aqua", category: "RO_HOT_COLD_PURIFIER", inspectionEveryMonths: 1 },

    // ── Powerless water purifier ─────────────────────────────────────
    { code: "PTS-100W", name: "PTS-100W Powerless Water Purifier", brand: "Seoul Aqua", category: "POWERLESS_PURIFIER", inspectionEveryMonths: 6 },
    { code: "PTS-100H", name: "PTS-100H Powerless Water Purifier", brand: "Seoul Aqua", category: "POWERLESS_PURIFIER", inspectionEveryMonths: 6 },

    // ── Ice maker ────────────────────────────────────────────────────
    { code: "FSM30",  name: "FSM30 Ice Maker",  brand: "Seoul Aqua", category: "ICE_MAKER", inspectionEveryMonths: 1, retailPrice: 22_000_000, monthlyRentalPrice: 850_000, monthlyMaintenancePrice: 250_000 },
    { code: "FSM100", name: "FSM100 Ice Maker", brand: "Seoul Aqua", category: "ICE_MAKER", inspectionEveryMonths: 1 },
    { code: "FSM150", name: "FSM150 Ice Maker", brand: "Seoul Aqua", category: "ICE_MAKER", inspectionEveryMonths: 1 },
    { code: "FSM200", name: "FSM200 Ice Maker", brand: "Seoul Aqua", category: "ICE_MAKER", inspectionEveryMonths: 1 },
    { code: "FSM300", name: "FSM300 Ice Maker", brand: "Seoul Aqua", category: "ICE_MAKER", inspectionEveryMonths: 1 },

    // ── Bidet (automatic) ────────────────────────────────────────────
    { code: "SA-J430", name: "SA-J430 Smart Bidet", brand: "Seoul Aqua", category: "BIDET", inspectionEveryMonths: 6, retailPrice: 12_000_000, monthlyRentalPrice: 480_000, monthlyMaintenancePrice: 80_000 },
    { code: "SA-J830", name: "SA-J830 Smart Bidet", brand: "Seoul Aqua", category: "BIDET", inspectionEveryMonths: 6, retailPrice: 14_500_000 },

    // ── Non-powered manual bidet ─────────────────────────────────────
    { code: "HB-220",   name: "HB-220 Manual Bidet",   brand: "Seoul Aqua", category: "MANUAL_BIDET", inspectionEveryMonths: 12 },
    { code: "GBD-1800", name: "GBD-1800 Manual Bidet", brand: "Seoul Aqua", category: "MANUAL_BIDET", inspectionEveryMonths: 12 },

    // ── Water dispenser ──────────────────────────────────────────────
    { code: "PTS-700", name: "PTS-700 Water Dispenser", brand: "Seoul Aqua", category: "WATER_DISPENSER", inspectionEveryMonths: 6 },

    // ── Micro bubble cleaner ─────────────────────────────────────────
    { code: "FC-210G", name: "FC-210G Microbubble Cleaner", brand: "Seoul Aqua", category: "MICROBUBBLE_CLEANER", inspectionEveryMonths: 3 },

    // ── Household water filter — DEWBELL ─────────────────────────────
    { code: "AC-700-10IN", name: "AC-700 10IN Filter Housing", brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "AC-700-20IN", name: "AC-700 20IN Filter Housing", brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "JBS-CFCS",    name: "JBS + CFCS Combo Filter",     brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "JB-S",        name: "JB-S Filter",                 brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "CF-CS",       name: "CF-CS Filter",                brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "CF-CSP",      name: "CF-CSP Filter",               brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "UC-1",        name: "UC-1 Filter",                 brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "SC-RS",       name: "SC-RS Filter",                brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 6 },
    { code: "SA-01",       name: "SA-01 Shower Head with PP Filter", brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 2 },
    { code: "C101",        name: "Dewbell F15 — Shower Line",   brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 3 },
    { code: "C105",        name: "Dewbell F15 — Wash Basin",    brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 3 },
    { code: "C109",        name: "Dewbell F15 — Washing Machine", brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 3 },
    { code: "A507",        name: "Dewbell Kit Pro — Wash Basin", brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 3 },
    { code: "C213-WH-E",   name: "Dewbell Cookfil White",       brand: "DEWBEL", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 3 },

    // ── Household water filter — FRELLE (Microbubble shower line) ────
    { code: "PBK-35WH",    name: "Frelle Microbubble Shower Kit", brand: "FRELLE", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 2 },
    { code: "FBS-51WH",    name: "Frelle Microbubble Shower Head (White)", brand: "FRELLE", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 2 },
    { code: "FBS-51BL",    name: "Frelle Microbubble Shower Head (Black)", brand: "FRELLE", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 2 },
    { code: "FBS-51YL",    name: "Frelle Microbubble Shower Head (Yellow)", brand: "FRELLE", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 2 },
    { code: "FBS-51PK",    name: "Frelle Microbubble Shower Head (Pink)", brand: "FRELLE", category: "HOUSEHOLD_FILTER", inspectionEveryMonths: 2 },
  ];

  const modelByCode = new Map<string, { id: string; modelCode: string | null }>();
  for (const m of modelSeed) {
    const legacy = legacyCategoryByCode[m.category] ?? "OTHER";
    const row = await prisma.equipmentModel.upsert({
      where: { modelCode: m.code },
      update: {
        nameKo: m.displayKo ?? m.code,
        nameVi: m.displayVi ?? m.code,
        nameEn: m.displayEn ?? m.code,
        brandId: brandsByName.get(m.brand)?.id,
        categoryId: categoriesByCode.get(m.category)?.id,
        category: legacy,
        inspectionEveryMonths: m.inspectionEveryMonths ?? null,
        warrantyMonths: m.warrantyMonths ?? 12,
        ...(m.retailPrice != null ? { retailPrice: m.retailPrice } : {}),
        ...(m.monthlyRentalPrice != null ? { monthlyRentalPrice: m.monthlyRentalPrice } : {}),
        ...(m.monthlyMaintenancePrice != null ? { monthlyMaintenancePrice: m.monthlyMaintenancePrice } : {}),
      },
      create: {
        modelCode: m.code,
        nameKo: m.displayKo ?? m.code,
        nameVi: m.displayVi ?? m.code,
        nameEn: m.displayEn ?? m.code,
        brandId: brandsByName.get(m.brand)?.id,
        categoryId: categoriesByCode.get(m.category)?.id,
        category: legacy,
        inspectionEveryMonths: m.inspectionEveryMonths ?? null,
        warrantyMonths: m.warrantyMonths ?? 12,
        ...(m.retailPrice != null ? { retailPrice: m.retailPrice } : {}),
        ...(m.monthlyRentalPrice != null ? { monthlyRentalPrice: m.monthlyRentalPrice } : {}),
        ...(m.monthlyMaintenancePrice != null ? { monthlyMaintenancePrice: m.monthlyMaintenancePrice } : {}),
      },
    });
    modelByCode.set(m.code, row);
  }

  // Downstream code (customer/contract/visit seeds) still references these
  // aliases — keep them resolved from the map so the data-driven refactor is
  // transparent to the rest of the file. PDF reclassifies AC-700 as a DEWBEL
  // filter housing (not an air purifier) so legacy `air` now points at the
  // next-best Seoul Aqua air purifier (CA-7000WS/B). PTS-3500 isn't in the
  // PDF either — purifierPro maps to PTS-4000T (next tier).
  const purifier    = modelByCode.get("PTS-2100")!;
  const purifierPro = modelByCode.get("PTS-4000T")!;
  const bidet       = modelByCode.get("SA-J430")!;
  const air         = modelByCode.get("CA-7000WS/B")!;

  console.log(`  ✓ equipment models (${modelSeed.length})`);

  // ─── Consumables (filters / replaceable parts) ──────────────────────
  // Data-driven from the "필터+교체주기" columns of the PDF.
  // `compatibleModels` references model CODES (not ids); the loop below
  // resolves them via modelByCode so additions stay one-line edits.
  type ConsumableSeed = {
    sku: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
    replaceEveryMonths: number | null;
    cleanEveryMonths: number | null;
    cleanOnEveryVisit?: boolean;
    retailPrice: number;
    compatibleModels: { modelCode: string; quantity: number }[];
  };

  // Model-code groups for compatibility wiring. Single source of truth so
  // adding a new water-purifier SKU automatically picks up the 4 standard
  // filters and all common accessories.
  const HCWP_STANDARD_CODES = [
    "PTS-2100", "PTS-2101", "PTS-2200", "PTS-2000", "PTS-3000", "PTS-3001",
    "PTS-4000T", "PTS-4001T",
    "PQ-800", "KW-1500",
    "KJ-1500", "KJ-2000", "KJ-2500", "KJ-3000", "KJ-4000",
    "KG-5000",
    "SA-5000", "SA-7000", "SA-8000",
    "VI-1000", "VI-1000-04", "VI-1000-08",
    "KH-750", "KJ-750",
    "P-3001",
  ];
  const RO_CODES = ["CHP-590R", "CHP-671R", "PTS-2100-RO"];
  const POWERLESS_CODES = ["PTS-100W", "PTS-100H"];
  const ICE_SMALL_CODES = ["FSM30", "FSM100", "FSM150"];      // JB-S + CF-CS + UV LAMP
  const ICE_LARGE_2X_CODES = ["FSM200"];                      // 4-filter purifier set × 2
  const ICE_LARGE_4X_CODES = ["FSM300"];                      // 4-filter purifier set × 4
  const BIDET_CODES = ["SA-J430", "SA-J830"];
  const ALL_PURIFIER_CODES = [...HCWP_STANDARD_CODES, ...RO_CODES];

  const withQty = (codes: string[], quantity = 1) =>
    codes.map((modelCode) => ({ modelCode, quantity }));

  const consumableSeed: ConsumableSeed[] = [
    // ── Hot/Cold + RO purifier — PRE-FILTER (clean every visit) ──────
    {
      sku: "FLT-PURIFIER-PREFILTER",
      nameKo: "정수기 PRE-FILTER",
      nameVi: "Lõi PRE-FILTER (lọc nước)",
      nameEn: "PRE-FILTER (water purifier)",
      replaceEveryMonths: null,
      cleanEveryMonths: null,
      cleanOnEveryVisit: true,
      retailPrice: 80_000,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },

    // ── HCWP standard 4-filter set (also used by FSM200/FSM300 ice makers) ──
    {
      sku: "FLT-SED-11",
      nameKo: "세디먼트 필터 11\"",
      nameVi: "Lõi lọc thô 11\" (Sediment)",
      nameEn: "Sediment filter 11\"",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModels: [
        ...withQty(HCWP_STANDARD_CODES, 1),
        ...withQty(RO_CODES, 1),
        ...withQty(ICE_LARGE_2X_CODES, 2),
        ...withQty(ICE_LARGE_4X_CODES, 4),
      ],
    },
    {
      sku: "FLT-PRE-CARB-11",
      nameKo: "프리카본 필터 11\"",
      nameVi: "Lõi lọc tiền carbon 11\" (Pre-Carbon)",
      nameEn: "Pre-Carbon filter 11\"",
      replaceEveryMonths: 8,
      cleanEveryMonths: null,
      retailPrice: 220_000,
      compatibleModels: [
        ...withQty(HCWP_STANDARD_CODES, 1),
        ...withQty(RO_CODES, 1),
        ...withQty(ICE_LARGE_2X_CODES, 2),
        ...withQty(ICE_LARGE_4X_CODES, 4),
      ],
    },
    {
      sku: "FLT-UF-11",
      nameKo: "UF 필터 11\"",
      nameVi: "Lõi UF 11\"",
      nameEn: "UF filter 11\"",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 280_000,
      compatibleModels: [
        ...withQty(HCWP_STANDARD_CODES, 1),
        ...withQty(ICE_LARGE_2X_CODES, 2),
        ...withQty(ICE_LARGE_4X_CODES, 4),
      ],
    },
    {
      sku: "FLT-POST-CARB-11",
      nameKo: "포스트카본 필터 11\"",
      nameVi: "Lõi lọc hậu carbon 11\" (Post-Carbon)",
      nameEn: "Post-Carbon filter 11\"",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 240_000,
      compatibleModels: [
        ...withQty(HCWP_STANDARD_CODES, 1),
        ...withQty(RO_CODES, 1),
        ...withQty(ICE_LARGE_2X_CODES, 2),
        ...withQty(ICE_LARGE_4X_CODES, 4),
      ],
    },
    {
      sku: "FLT-RO-100GPD-11",
      nameKo: "RO 멤브레인 100GPD 11\"",
      nameVi: "Màng RO 100GPD 11\"",
      nameEn: "RO 100GPD Membrane 11\"",
      replaceEveryMonths: 18,
      cleanEveryMonths: 6,
      retailPrice: 650_000,
      compatibleModels: withQty(RO_CODES, 1),
    },

    // ── Powerless purifier (9" set) ──────────────────────────────────
    {
      sku: "FLT-COMPOUND-9",
      nameKo: "콤파운드 필터 9\"",
      nameVi: "Lõi Compound 9\"",
      nameEn: "Compound Filter 9\"",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 220_000,
      compatibleModels: withQty(POWERLESS_CODES, 1),
    },
    {
      sku: "FLT-UF-MEMB-9",
      nameKo: "UF 멤브레인 9\"",
      nameVi: "Màng UF 9\"",
      nameEn: "UF Membrane 9\"",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 260_000,
      compatibleModels: withQty(POWERLESS_CODES, 1),
    },
    {
      sku: "FLT-POST-BLOCK-9",
      nameKo: "포스트 블록 카본 9\"",
      nameVi: "Carbon block hậu 9\"",
      nameEn: "Post Block Carbon 9\"",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 230_000,
      compatibleModels: withQty(POWERLESS_CODES, 1),
    },

    // ── Ice maker (small: FSM30/100/150) ─────────────────────────────
    {
      sku: "FLT-ICE-JBS",
      nameKo: "JB-S 필터(제빙기)",
      nameVi: "Lõi JB-S (máy làm đá)",
      nameEn: "JB-S filter (ice maker)",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 320_000,
      compatibleModels: [
        ...withQty(ICE_SMALL_CODES, 1),
        // Also used as a refill cartridge for the DEWBELL JBS+CFCS combo
        // and the standalone JB-S filter housing.
        ...withQty(["JBS-CFCS", "JB-S"], 1),
      ],
    },
    {
      sku: "FLT-ICE-CFCS",
      nameKo: "CF-CS 필터(제빙기)",
      nameVi: "Lõi CF-CS (máy làm đá)",
      nameEn: "CF-CS filter (ice maker)",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 280_000,
      compatibleModels: [
        ...withQty(ICE_SMALL_CODES, 1),
        ...withQty(["JBS-CFCS", "CF-CS"], 1),
      ],
    },
    {
      sku: "FLT-ICE-UVLAMP",
      nameKo: "UV 램프(제빙기)",
      nameVi: "Đèn UV (máy làm đá)",
      nameEn: "UV lamp (ice maker)",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 540_000,
      compatibleModels: withQty(ICE_SMALL_CODES, 1),
    },

    // ── Bidet (SA-J430 / SA-J830) ────────────────────────────────────
    {
      sku: "FLT-BIDET-001",
      nameKo: "비데 워터필터",
      nameVi: "Lõi lọc nước bồn cầu",
      nameEn: "Bidet water filter",
      replaceEveryMonths: 2,
      cleanEveryMonths: null,
      retailPrice: 280_000,
      compatibleModels: withQty(BIDET_CODES, 1),
    },

    // ── Microbubble cleaner FC-210G ──────────────────────────────────
    {
      sku: "FLT-MICRO-CFR20RC",
      nameKo: "CFR-20RC 필터",
      nameVi: "Lõi CFR-20RC",
      nameEn: "CFR-20RC filter",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 220_000,
      compatibleModels: withQty(["FC-210G"], 1),
    },

    // ── Air purifier — CA-5000W / AP-400 (standard 3-filter set) ─────
    {
      sku: "FLT-AIR-PREFILTER",
      nameKo: "공기청정기 프리필터",
      nameVi: "Lõi lọc thô máy lọc khí",
      nameEn: "Air pre-filter",
      replaceEveryMonths: null,
      cleanEveryMonths: null,
      cleanOnEveryVisit: true,
      retailPrice: 90_000,
      compatibleModels: withQty(["CA-5000W", "AP-400", "AD-1615A"], 1),
    },
    {
      sku: "FLT-AIR-HEPA-6",
      nameKo: "HEPA 필터 (공기청정기, 6개월)",
      nameVi: "Lõi HEPA (lọc khí, 6 tháng)",
      nameEn: "HEPA filter (air, 6 months)",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 420_000,
      compatibleModels: withQty(["CA-5000W", "AP-400"], 1),
    },
    {
      sku: "FLT-AIR-DEODORIZE-12",
      nameKo: "탈취 필터 (공기청정기)",
      nameVi: "Lõi khử mùi (lọc khí)",
      nameEn: "Deodorizing filter (air)",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 380_000,
      compatibleModels: withQty(["CA-5000W", "AP-400", "AD-1615A"], 1),
    },

    // ── Air purifier — CA-7000WS/B (SVC service kit) ─────────────────
    {
      sku: "FLT-AIR-SVC-PREMESH",
      nameKo: "SVC Pre-Filter (Mesh)",
      nameVi: "SVC Pre-Filter (Mesh)",
      nameEn: "SVC Pre-Filter (Mesh)",
      replaceEveryMonths: null,
      cleanEveryMonths: 3,
      retailPrice: 120_000,
      compatibleModels: withQty(["CA-7000WS/B"], 1),
    },
    {
      sku: "FLT-AIR-SVC-H13",
      nameKo: "SVC FILTER SET (H13 HEPA)",
      nameVi: "Bộ lọc SVC (H13 HEPA)",
      nameEn: "SVC FILTER SET (H13 HEPA)",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 620_000,
      compatibleModels: withQty(["CA-7000WS/B"], 1),
    },

    // ── Air purifier — AP-3008FH (double set, all qty 2) ─────────────
    {
      sku: "FLT-AIR-NON-WOWEN",
      nameKo: "NON WOVEN 필터",
      nameVi: "Lõi NON WOVEN",
      nameEn: "NON WOVEN filter",
      replaceEveryMonths: 4,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModels: withQty(["AP-3008FH"], 2),
    },
    {
      sku: "FLT-AIR-OPTION",
      nameKo: "OPTION 필터 (AP-3008FH)",
      nameVi: "Lõi OPTION (AP-3008FH)",
      nameEn: "OPTION filter (AP-3008FH)",
      replaceEveryMonths: 4,
      cleanEveryMonths: null,
      retailPrice: 200_000,
      compatibleModels: withQty(["AP-3008FH"], 2),
    },
    {
      sku: "FLT-AIR-HEPA-12-AP3008",
      nameKo: "HEPA 필터 (AP-3008FH, 12개월)",
      nameVi: "Lõi HEPA (AP-3008FH, 12 tháng)",
      nameEn: "HEPA filter (AP-3008FH, 12 months)",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 480_000,
      compatibleModels: withQty(["AP-3008FH"], 2),
    },
    {
      sku: "FLT-AIR-DEODORIZE-AP3008",
      nameKo: "탈취 필터 (AP-3008FH)",
      nameVi: "Lõi khử mùi (AP-3008FH)",
      nameEn: "Deodorizing filter (AP-3008FH)",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 420_000,
      compatibleModels: withQty(["AP-3008FH"], 2),
    },

    // ── Air purifier — FA31-202GY / FA41-402GY (single 6-month filter) ──
    {
      sku: "FLT-AIR-CLEANER",
      nameKo: "AIR CLEANER FILTER",
      nameVi: "Lõi AIR CLEANER",
      nameEn: "AIR CLEANER FILTER",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 320_000,
      compatibleModels: withQty(["FA31-202GY", "FA41-402GY"], 1),
    },

    // ── Home + Industrial dehumidifier (PRE-FILTER only) ─────────────
    {
      sku: "FLT-DEHUM-PREFILTER",
      nameKo: "제습기 PRE-FILTER",
      nameVi: "Lõi PRE-FILTER (máy hút ẩm)",
      nameEn: "PRE-FILTER (dehumidifier)",
      replaceEveryMonths: null,
      cleanEveryMonths: null,
      cleanOnEveryVisit: true,
      retailPrice: 95_000,
      compatibleModels: withQty(["DXTH120-NEK", "HDI-15000SW", "HDI-25000SW"], 1),
    },

    // ── DEWBELL household filter — AC-700 10" set (PP/CTO/UFD) ───────
    {
      sku: "FLT-DEW-PP-10",
      nameKo: "PP 10\" 필터",
      nameVi: "Lõi PP 10\"",
      nameEn: "PP 10\" filter",
      replaceEveryMonths: 1,
      cleanEveryMonths: null,
      retailPrice: 75_000,
      compatibleModels: withQty(["AC-700-10IN"], 1),
    },
    {
      sku: "FLT-DEW-CTO-10",
      nameKo: "CTO 10\" 필터",
      nameVi: "Lõi CTO 10\"",
      nameEn: "CTO 10\" filter",
      replaceEveryMonths: 4,
      cleanEveryMonths: null,
      retailPrice: 110_000,
      compatibleModels: withQty(["AC-700-10IN"], 1),
    },
    {
      sku: "FLT-DEW-UFD-10",
      nameKo: "UFD 10\" 필터",
      nameVi: "Lõi UFD 10\"",
      nameEn: "UFD 10\" filter",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 165_000,
      compatibleModels: withQty(["AC-700-10IN"], 1),
    },

    // ── DEWBELL household filter — AC-700 20" set (PP/CTO/UFD) ───────
    {
      sku: "FLT-DEW-PP-20",
      nameKo: "PP 20\" 필터",
      nameVi: "Lõi PP 20\"",
      nameEn: "PP 20\" filter",
      replaceEveryMonths: 1,
      cleanEveryMonths: null,
      retailPrice: 120_000,
      compatibleModels: withQty(["AC-700-20IN"], 1),
    },
    {
      sku: "FLT-DEW-CTO-20",
      nameKo: "CTO 20\" 필터",
      nameVi: "Lõi CTO 20\"",
      nameEn: "CTO 20\" filter",
      replaceEveryMonths: 4,
      cleanEveryMonths: null,
      retailPrice: 165_000,
      compatibleModels: withQty(["AC-700-20IN"], 1),
    },
    {
      sku: "FLT-DEW-UFD-20",
      nameKo: "UFD 20\" 필터",
      nameVi: "Lõi UFD 20\"",
      nameEn: "UFD 20\" filter",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 240_000,
      compatibleModels: withQty(["AC-700-20IN"], 1),
    },

    // ── DEWBELL standalone household filters (CF-CSP / UC-1 / SC-RS) ──
    {
      sku: "FLT-DEW-CFCSP",
      nameKo: "CF-CSP 카트리지",
      nameVi: "Lõi CF-CSP",
      nameEn: "CF-CSP cartridge",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModels: withQty(["CF-CSP"], 1),
    },
    {
      sku: "FLT-DEW-UC1",
      nameKo: "UC-1 카트리지",
      nameVi: "Lõi UC-1",
      nameEn: "UC-1 cartridge",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModels: withQty(["UC-1"], 1),
    },
    {
      sku: "FLT-DEW-SCRS",
      nameKo: "SC-RS 카트리지",
      nameVi: "Lõi SC-RS",
      nameEn: "SC-RS cartridge",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModels: withQty(["SC-RS"], 1),
    },

    // ── DEWBELL F15 refills (C101 / C105 / C109 housings) ────────────
    {
      sku: "FLT-DEW-F15-ECON",
      nameKo: "F15 리필 — 알뜰형",
      nameVi: "Lõi F15 — loại tiết kiệm",
      nameEn: "F15 Refill — Economy",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 65_000,
      compatibleModels: withQty(["C101", "C105", "C109"], 1),
    },
    {
      sku: "FLT-DEW-F15-PREMIUM",
      nameKo: "F15 리필 — 고급형",
      nameVi: "Lõi F15 — loại cao cấp",
      nameEn: "F15 Refill — Premium",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 95_000,
      compatibleModels: withQty(["C101", "C105", "C109"], 1),
    },

    // ── DEWBELL Kit Pro refill (A507 housing) ────────────────────────
    {
      sku: "FLT-DEW-KITPRO",
      nameKo: "키트프로 리필",
      nameVi: "Lõi Kit Pro",
      nameEn: "Kit Pro refill",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 95_000,
      compatibleModels: withQty(["A507"], 1),
    },

    // ── DEWBELL Cookfil refill (C213-WH-E housing) ───────────────────
    {
      sku: "FLT-DEW-COOKFIL",
      nameKo: "쿡필 리필 (ACF)",
      nameVi: "Lõi Cookfil (ACF)",
      nameEn: "Cookfil refill (ACF)",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 95_000,
      compatibleModels: withQty(["C213-WH-E"], 1),
    },

    // ── DEWBELL SA-01 shower head refill ─────────────────────────────
    {
      sku: "FLT-DEW-SHOWER-PP",
      nameKo: "샤워기헤드 PP 코튼 리필",
      nameVi: "Lõi PP cotton (vòi sen)",
      nameEn: "Shower head PP Cotton refill",
      replaceEveryMonths: 2,
      cleanEveryMonths: null,
      retailPrice: 55_000,
      compatibleModels: withQty(["SA-01"], 1),
    },

    // ── FRELLE microbubble shower refills ────────────────────────────
    {
      sku: "FLT-FRL-RUST",
      nameKo: "프렐 녹물제거 리필",
      nameVi: "Lõi PP loại bỏ gỉ sét (Frelle)",
      nameEn: "Frelle rust-removal refill",
      replaceEveryMonths: 2,
      cleanEveryMonths: null,
      retailPrice: 95_000,
      compatibleModels: withQty(["FBS-51WH", "FBS-51BL", "FBS-51YL", "FBS-51PK"], 1),
    },
    {
      sku: "FLT-FRL-CHLORINE",
      nameKo: "프렐 항균 염소 필터",
      nameVi: "Lõi khử clo (Frelle)",
      nameEn: "Frelle chlorine-removal refill",
      replaceEveryMonths: 2,
      cleanEveryMonths: null,
      retailPrice: 110_000,
      compatibleModels: withQty(["FBS-51WH", "FBS-51BL", "FBS-51YL", "FBS-51PK"], 1),
    },
    {
      sku: "FLT-FRL-BUBBLE-BOOSTER",
      nameKo: "버블 부스터 녹물제거 필터",
      nameVi: "Lõi mini Bubble Booster",
      nameEn: "Bubble Booster filter",
      replaceEveryMonths: 2,
      cleanEveryMonths: null,
      retailPrice: 85_000,
      compatibleModels: withQty(["PBK-35WH"], 1),
    },
  ];

  for (const c of consumableSeed) {
    const row = await prisma.consumable.upsert({
      where: { sku: c.sku },
      update: {
        nameKo: c.nameKo,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        replaceEveryMonths: c.replaceEveryMonths,
        cleanEveryMonths: c.cleanEveryMonths,
        cleanOnEveryVisit: c.cleanOnEveryVisit ?? false,
        retailPrice: c.retailPrice,
      },
      create: {
        sku: c.sku,
        nameKo: c.nameKo,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        replaceEveryMonths: c.replaceEveryMonths,
        cleanEveryMonths: c.cleanEveryMonths,
        cleanOnEveryVisit: c.cleanOnEveryVisit ?? false,
        retailPrice: c.retailPrice,
      },
    });
    // Reset compatibility and rewrite — keeps the join table aligned with
    // the seed declaration (small N, safe to nuke+recreate).
    await prisma.consumableOnModel.deleteMany({ where: { consumableId: row.id } });
    for (const m of c.compatibleModels) {
      const model = modelByCode.get(m.modelCode);
      if (!model) {
        console.warn(`  ⚠ consumable ${c.sku}: skipping unknown model code "${m.modelCode}"`);
        continue;
      }
      await prisma.consumableOnModel.create({
        data: { consumableId: row.id, modelId: model.id, quantity: m.quantity },
      });
    }
  }
  console.log(`  ✓ consumables (${consumableSeed.length})`);

  // ─── Accessories (parts / spare components) ─────────────────────────
  // Data-driven from the "정수기 부속품" PDF — common parts are wired to
  // ALL_PURIFIER_CODES (HCWP + RO); PTS-2100 / PTS-4000T-specific parts use
  // their own model code groups. PDF C.2: minor parts (cocks, valves, hoses,
  // fittings) stay free for MAINTENANCE customers; major parts (compressor,
  // hot-water tank, PCB) are billed.
  type AccessorySeed = {
    sku: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
    retailPrice: number;
    isMinorPart: boolean;
    compatibleModels: { modelCode: string; quantity: number }[];
  };

  // Per-model accessory groups (PDF "정수기 부속품" lists PTS-2100 +
  // PTS-4000T + PTS-4001T separately; the two PTS-4000T variants share
  // the same accessory list).
  const PTS_2100_ONLY = ["PTS-2100"];
  const PTS_4000_FAMILY = ["PTS-4000T", "PTS-4001T"];

  const accessorySeed: AccessorySeed[] = [
    // ── 모든 정수기 공용 (PDF "모든 정수기 공용") — minor parts ───────
    {
      sku: "ACC-SHUTOFF-VALVE",
      nameKo: "아답터 (Water shut-off valve)",
      nameVi: "Van khóa nước",
      nameEn: "Water shut-off valve",
      retailPrice: 45_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-TUBING-6MM",
      nameKo: "튜빙호스 6mm",
      nameVi: "Ống nước phi 6mm",
      nameEn: "6mm tubing hose",
      retailPrice: 30_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-FITTING-L14",
      nameKo: "L 피팅 1/4\"",
      nameVi: "Co nối 90 (1/4\")",
      nameEn: "L fitting 1/4\"",
      retailPrice: 18_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-FITTING-T14",
      nameKo: "T 피팅 1/4\"",
      nameVi: "Co nối chữ T (1/4\")",
      nameEn: "T fitting 1/4\"",
      retailPrice: 22_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-BIMETAL",
      nameKo: "바이메탈 (Bi-Metal)",
      nameVi: "Sò nóng",
      nameEn: "Bi-Metal",
      retailPrice: 95_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-INTER-VALVE-14",
      nameKo: "중간밸브 1/4\"",
      nameVi: "Van phi 6",
      nameEn: "Intermediate valve 1/4\"",
      retailPrice: 55_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-FUSE-001",
      nameKo: "퓨즈 (Fuse)",
      nameVi: "Cầu chì",
      nameEn: "Fuse",
      retailPrice: 12_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-FLOAT-VALVE",
      nameKo: "볼탑 (Floating Valve)",
      nameVi: "Van phao",
      nameEn: "Floating valve",
      retailPrice: 95_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-HOT-TAP",
      nameKo: "온수코크 (Transparent Water Tap - Hot)",
      nameVi: "Vòi nước nóng (loại thường)",
      nameEn: "Transparent Water Tap (Hot)",
      retailPrice: 250_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-COLD-TAP",
      nameKo: "냉수코크 (Transparent Water Tap - Cold)",
      nameVi: "Vòi nước lạnh (loại thường)",
      nameEn: "Transparent Water Tap (Cold)",
      retailPrice: 220_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },

    // ── 모든 정수기 공용 — major (billable) parts ─────────────────────
    {
      sku: "ACC-COLD-TC",
      nameKo: "COLD TC (냉수 센서)",
      nameVi: "Cảm biến lạnh",
      nameEn: "COLD TC sensor",
      retailPrice: 380_000,
      isMinorPart: false,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-COMPRESSOR",
      nameKo: "콤프레샤",
      nameVi: "Block làm lạnh",
      nameEn: "Compressor",
      retailPrice: 3_800_000,
      isMinorPart: false,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-PTC-ORP",
      nameKo: "PTC & ORP",
      nameVi: "Role Block",
      nameEn: "PTC & ORP",
      retailPrice: 580_000,
      isMinorPart: false,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },

    // ── PTS-2100 전용 ────────────────────────────────────────────────
    {
      sku: "ACC-TANK-COVER-PTS2100",
      nameKo: "탱크뚜껑 (PTS-2100)",
      nameVi: "Nắp bồn nước (PTS-2100)",
      nameEn: "Tank cover (PTS-2100)",
      retailPrice: 220_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_2100_ONLY),
    },
    {
      sku: "ACC-HOT-TANK-3L-PTS2100",
      nameKo: "3L 온수탱크 (PTS-2100)",
      nameVi: "Bình nóng 3L (PTS-2100)",
      nameEn: "3L Hot Water Tank (PTS-2100)",
      retailPrice: 1_450_000,
      isMinorPart: false,
      compatibleModels: withQty(PTS_2100_ONLY),
    },
    {
      sku: "ACC-COLD-TANK-SILICON-PTS2100",
      nameKo: "뚜껑 실리콘 (PTS-2100)",
      nameVi: "Joăng silicon bồn lạnh (PTS-2100)",
      nameEn: "COLD TANK SILICON (PTS-2100)",
      retailPrice: 65_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_2100_ONLY),
    },
    {
      sku: "ACC-WATER-TRAY-SET-PTS2100",
      nameKo: "WATER TRAY SET (PTS-2100)",
      nameVi: "Bộ khay hứng nước (PTS-2100)",
      nameEn: "Water Tray Set (PTS-2100)",
      retailPrice: 180_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_2100_ONLY),
    },
    {
      sku: "ACC-WATER-TRAP-GRILL-PTS2100",
      nameKo: "WATER TRAP GRILL (PTS-2100)",
      nameVi: "Nắp khay hứng nước (PTS-2100)",
      nameEn: "Water Trap Grill (PTS-2100)",
      retailPrice: 60_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_2100_ONLY),
    },
    {
      sku: "ACC-TAP-COVER-PTS2100",
      nameKo: "TAP COVER (PTS-2100)",
      nameVi: "Nắp đậy vòi nước (PTS-2100)",
      nameEn: "Tap Cover (PTS-2100)",
      retailPrice: 110_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_2100_ONLY),
    },
    {
      sku: "ACC-COLD-TAP-PTS2100",
      nameKo: "냉수코크 (PTS-2100)",
      nameVi: "Vòi lạnh (PTS-2100)",
      nameEn: "Cold water tap (PTS-2100)",
      retailPrice: 240_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_2100_ONLY),
    },
    {
      sku: "ACC-HOT-TAP-PTS2100",
      nameKo: "온수코크 (PTS-2100)",
      nameVi: "Vòi nóng (PTS-2100)",
      nameEn: "Hot water tap (PTS-2100)",
      retailPrice: 280_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_2100_ONLY),
    },

    // ── PTS-4000T / PTS-4001T 전용 ───────────────────────────────────
    {
      sku: "ACC-TAP-COVER-PTS4000",
      nameKo: "TAP COVER (PTS-4000T/4001T)",
      nameVi: "Nắp đậy vòi nước (PTS-4000T/4001T)",
      nameEn: "Tap Cover (PTS-4000T/4001T)",
      retailPrice: 130_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_4000_FAMILY),
    },
    {
      sku: "ACC-COLD-TAP-PTS4000",
      nameKo: "냉수코크 (PTS-4000T/4001T)",
      nameVi: "Vòi lạnh (PTS-4000T/4001T)",
      nameEn: "Cold water tap (PTS-4000T/4001T)",
      retailPrice: 260_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_4000_FAMILY),
    },
    {
      sku: "ACC-HOT-TAP-PTS4000",
      nameKo: "온수코크 (PTS-4000T/4001T)",
      nameVi: "Vòi nóng (PTS-4000T/4001T)",
      nameEn: "Hot water tap (PTS-4000T/4001T)",
      retailPrice: 300_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_4000_FAMILY),
    },
    {
      sku: "ACC-PCB-CLOCK-PTS4000",
      nameKo: "PCB clock (PTS-4000T/4001T)",
      nameVi: "Mạch điện đồng hồ (PTS-4000T/4001T)",
      nameEn: "PCB clock (PTS-4000T/4001T)",
      retailPrice: 1_200_000,
      isMinorPart: false,
      compatibleModels: withQty(PTS_4000_FAMILY),
    },
    {
      sku: "ACC-PCB-POWER-PTS4000",
      nameKo: "PCB power (PTS-4000T/4001T)",
      nameVi: "Mạch đèn báo (PTS-4000T/4001T)",
      nameEn: "PCB power (PTS-4000T/4001T)",
      retailPrice: 980_000,
      isMinorPart: false,
      compatibleModels: withQty(PTS_4000_FAMILY),
    },
    {
      sku: "ACC-COCK-BUTTON-PTS4000",
      nameKo: "코크버튼 (PTS-4000T/4001T)",
      nameVi: "Nút nhấn vòi nước (PTS-4000T/4001T)",
      nameEn: "Cock button (PTS-4000T/4001T)",
      retailPrice: 75_000,
      isMinorPart: true,
      compatibleModels: withQty(PTS_4000_FAMILY),
    },

    // ── Legacy accessories carried forward (mount / adapter / hose) ──
    {
      sku: "ACC-MOUNT-001",
      nameKo: "벽걸이 거치대",
      nameVi: "Giá treo tường",
      nameEn: "Wall mount",
      retailPrice: 120_000,
      isMinorPart: true,
      compatibleModels: withQty(ALL_PURIFIER_CODES),
    },
    {
      sku: "ACC-ADAPTER-001",
      nameKo: "전원 어댑터",
      nameVi: "Bộ chuyển nguồn",
      nameEn: "Power adapter",
      retailPrice: 90_000,
      isMinorPart: true,
      compatibleModels: withQty([...ALL_PURIFIER_CODES, "SA-J430", "SA-J830", "CA-5000W", "CA-7000WS/B"]),
    },
    {
      sku: "ACC-HOSE-001",
      nameKo: "급수 호스 (3m)",
      nameVi: "Ống cấp nước (3m)",
      nameEn: "Inlet hose (3m)",
      retailPrice: 60_000,
      isMinorPart: true,
      compatibleModels: withQty([...ALL_PURIFIER_CODES, "SA-J430", "SA-J830"]),
    },
  ];

  for (const a of accessorySeed) {
    const row = await prisma.accessory.upsert({
      where: { sku: a.sku },
      update: {
        nameKo: a.nameKo,
        nameVi: a.nameVi,
        nameEn: a.nameEn,
        isMinorPart: a.isMinorPart,
        retailPrice: a.retailPrice,
      },
      create: {
        sku: a.sku,
        nameKo: a.nameKo,
        nameVi: a.nameVi,
        nameEn: a.nameEn,
        isMinorPart: a.isMinorPart,
        retailPrice: a.retailPrice,
      },
    });
    await prisma.accessoryOnModel.deleteMany({ where: { accessoryId: row.id } });
    for (const m of a.compatibleModels) {
      const model = modelByCode.get(m.modelCode);
      if (!model) {
        console.warn(`  ⚠ accessory ${a.sku}: skipping unknown model code "${m.modelCode}"`);
        continue;
      }
      await prisma.accessoryOnModel.create({
        data: { accessoryId: row.id, modelId: model.id, quantity: m.quantity },
      });
    }
  }
  console.log(`  ✓ accessories (${accessorySeed.length})`);

  // ─── B2C customer #1 (portal smoke account) ─────────────────────────
  // KH00001's CONTRACT_PARTY has portalEnabled + a known dev password
  // "portal1234" + mustChangePassword=true so the first-login force-change
  // flow can be exercised end-to-end.
  const portalPwHash = await hash("portal1234");
  const b2c = await prisma.customer.upsert({
    where: { code: "KH00001" },
    update: {},
    create: {
      code: "KH00001",
      type: "B2C",
      name: "Nguyễn Thị Lan",
      residency: "DOMESTIC",
      nationalId: "079123456701",
      address: "123 Lê Lợi, Phường Bến Nghé",
      district: "Quận 1",
      city: "TP. Hồ Chí Minh",
      preferredTechnicianId: tech1.id,
      preferredRegion: "HCMC-D1",
      contacts: {
        create: [
          {
            role: "CONTRACT_PARTY",
            scope: "CUSTOMER",
            isPrimary: false,
            name: "Nguyễn Thị Lan",
            phone1: "0901234567",
            email: "lan.nguyen@example.com",
            language: "vi",
            portalEnabled: true,
            passwordHash: portalPwHash,
            mustChangePassword: true,
          },
          {
            role: "OPS_CONTACT",
            scope: "CUSTOMER",
            isPrimary: true,
            name: "Nguyễn Văn Hùng",
            phone1: "0901234568",
            email: "hung.nguyen@example.com",
            language: "vi",
          },
        ],
      },
      equipment: {
        create: [
          {
            modelId: purifier.id,
            serialNumber: "PTS-2100-000001",
            installedAt: new Date("2025-06-15"),
            status: "ACTIVE",
            ownership: "COMPANY",
          },
        ],
      },
    },
    include: { equipment: true, contacts: true },
  });

  console.log(`  ✓ B2C customer ${b2c.code}`);

  // ─── B2B customer with sites ────────────────────────────────────────
  const b2b = await prisma.customer.upsert({
    where: { code: "KH00002" },
    update: {},
    create: {
      code: "KH00002",
      type: "B2B",
      name: "CÔNG TY TNHH SHERATON VIETNAM",
      shortcode: "SHV",
      taxCode: "0312345678",
      representativeName: "TRẦN VĂN MINH",
      residency: null,
      address: "Tầng 5, Tòa nhà HCMC HQ",
      city: "TP. Hồ Chí Minh",
      preferredRegion: "HCMC-D1",
      contacts: {
        create: [
          {
            role: "CONTRACT_PARTY",
            scope: "CUSTOMER",
            isPrimary: false,
            name: "Trần Văn Minh",
            title: "Giám đốc",
            phone1: "0901112233",
            email: "minh.tran@sheratonvn.example.com",
            language: "vi",
            // Portal access — B2B contract party, first login forces change.
            portalEnabled: true,
            passwordHash: portalPwHash,
            mustChangePassword: true,
          },
          {
            role: "OPS_CONTACT",
            scope: "CUSTOMER",
            isPrimary: true,
            name: "Lê Thị Mai",
            title: "Quản lý Văn phòng",
            phone1: "0901112234",
            email: "mai.le@sheratonvn.example.com",
            language: "vi",
            // Portal access — B2B primary OPS, exercises OPS-only access path.
            portalEnabled: true,
            passwordHash: portalPwHash,
            mustChangePassword: true,
          },
          {
            role: "OPS_CONTACT",
            scope: "CUSTOMER",
            isPrimary: false,
            isAccountingContact: true,
            name: "Vũ Thị Hương",
            title: "Trưởng phòng Kế toán",
            phone1: "0901112235",
            email: "huong.vu@sheratonvn.example.com",
            language: "vi",
          },
        ],
      },
      sites: {
        create: [
          {
            name: "HCMC HQ",
            address: "Tầng 5, Tòa nhà ABC, 100 Nguyễn Huệ",
            district: "Quận 1",
            city: "TP. Hồ Chí Minh",
            region: "HCMC-D1",
          },
          {
            name: "Hanoi Branch",
            address: "Số 50 Phố Trần Hưng Đạo",
            district: "Hoàn Kiếm",
            city: "Hà Nội",
            region: "HN-HK",
          },
        ],
      },
    },
    include: { sites: true },
  });

  // Add site-scoped contacts + equipment
  const hcmcSite = b2b.sites.find((s) => s.name === "HCMC HQ")!;
  const hnSite = b2b.sites.find((s) => s.name === "Hanoi Branch")!;

  await prisma.customerContact.upsert({
    where: { id: `seed-b2b-hcmc-ops` },
    update: {},
    create: {
      id: `seed-b2b-hcmc-ops`,
      customerId: b2b.id,
      siteId: hcmcSite.id,
      role: "OPS_CONTACT",
      scope: "SITE",
      isPrimary: true,
      name: "Phạm Văn Nam",
      title: "Trưởng tòa nhà HCMC",
      phone1: "0901112301",
      language: "vi",
    },
  });

  await prisma.customerContact.upsert({
    where: { id: `seed-b2b-hn-ops` },
    update: {},
    create: {
      id: `seed-b2b-hn-ops`,
      customerId: b2b.id,
      siteId: hnSite.id,
      role: "OPS_CONTACT",
      scope: "SITE",
      isPrimary: true,
      name: "Đỗ Thị Hoa",
      title: "Trưởng tòa nhà Hà Nội",
      phone1: "0901112302",
      language: "vi",
    },
  });

  // Equipment per site (stable serials → idempotent upsert by serialNumber not
  // available, so guard with findFirst to stay re-runnable outside reset flow).
  async function ensureEquipment(data: {
    serialNumber: string;
    customerId: string;
    siteId?: string;
    modelId: string;
    installedAt: Date;
    status?: "ACTIVE" | "REPLACED" | "RELOCATED" | "DEACTIVATED" | "TERMINATED";
    ownership?: "COMPANY" | "CUSTOMER";
  }) {
    const existing = await prisma.equipment.findFirst({
      where: { serialNumber: data.serialNumber },
    });
    if (existing) return existing;
    return prisma.equipment.create({
      data: {
        customerId: data.customerId,
        siteId: data.siteId,
        modelId: data.modelId,
        serialNumber: data.serialNumber,
        installedAt: data.installedAt,
        status: data.status ?? "ACTIVE",
        ownership: data.ownership ?? "COMPANY",
      },
    });
  }

  const b2bEq1 = await ensureEquipment({
    serialNumber: "PTS-2100-000010",
    customerId: b2b.id,
    siteId: hcmcSite.id,
    modelId: purifier.id,
    installedAt: new Date("2025-08-01"),
  });
  await ensureEquipment({
    serialNumber: "AC-700-000005",
    customerId: b2b.id,
    siteId: hcmcSite.id,
    modelId: air.id,
    installedAt: new Date("2025-08-01"),
  });
  await ensureEquipment({
    serialNumber: "PTS-2100-000011",
    customerId: b2b.id,
    siteId: hnSite.id,
    modelId: purifier.id,
    installedAt: new Date("2025-09-01"),
  });

  console.log(`  ✓ B2B customer ${b2b.code} (with 2 sites, 3 equipment)`);

  // ─── B2C customer #2 (post-rental, equipment owned by customer) ─────
  const b2c2 = await prisma.customer.upsert({
    where: { code: "KH00003" },
    update: {},
    create: {
      code: "KH00003",
      type: "B2C",
      name: "김민수",
      residency: "FOREIGN",
      passportNumber: "M22334455",
      nationality: "Korea",
      address: "456 Nguyễn Trãi",
      district: "Quận 5",
      city: "TP. Hồ Chí Minh",
      preferredTechnicianId: tech2.id,
      preferredRegion: "HCMC-D7",
      contacts: {
        create: [
          {
            role: "CONTRACT_PARTY",
            scope: "CUSTOMER",
            isPrimary: false,
            name: "김민수",
            phone1: "0901555000",
            email: "minsoo.kim@example.com",
            language: "ko",
            // Portal access — Korean-speaker, already finished the first
            // change so dev can jump straight into the portal UI.
            portalEnabled: true,
            passwordHash: portalPwHash,
            mustChangePassword: false,
          },
        ],
      },
      equipment: {
        create: [
          {
            modelId: bidet.id,
            serialNumber: "SA-J430-000001",
            installedAt: new Date("2022-03-01"),
            status: "ACTIVE",
            ownership: "CUSTOMER", // post-rental transfer (B.3)
          },
        ],
      },
    },
    include: { equipment: true, contacts: true },
  });

  console.log(`  ✓ B2C customer ${b2c2.code} (Korean speaker)`);

  // ─── Bulk B2C customers (KH00004–KH00010 domestic + KH00018-00020 foreign) ─
  type B2cSeed = {
    code: string;
    name: string;
    district: string;
    region: string;
    tech: string;
    model: { id: string };
    serial: string;
    lang?: "ko" | "vi" | "en";
    residency?: "DOMESTIC" | "FOREIGN";
    nationalId?: string;
    passportNumber?: string;
    nationality?: string;
  };
  const bulkB2c: B2cSeed[] = [
    { code: "KH00004", name: "Trần Thị Hồng", district: "Quận 3", region: "HCMC-D3", tech: tech3.id, model: bidet, serial: "SA-J430-000020", nationalId: "079123456704" },
    { code: "KH00005", name: "Võ Văn Tâm", district: "Quận 7", region: "HCMC-D7", tech: tech2.id, model: purifier, serial: "PTS-2100-000030", nationalId: "079123456705" },
    { code: "KH00006", name: "Đặng Thị Thúy", district: "Quận 1", region: "HCMC-D1", tech: tech1.id, model: air, serial: "AC-700-000020", nationalId: "079123456706" },
    { code: "KH00007", name: "Bùi Minh Khôi", district: "Quận 3", region: "HCMC-D3", tech: tech3.id, model: purifierPro, serial: "PTS-3500-000001", nationalId: "079123456707" },
    { code: "KH00008", name: "Hoàng Văn Long", district: "Hoàn Kiếm", region: "HN-HK", tech: tech4.id, model: purifier, serial: "PTS-2100-000031", nationalId: "001123456708" },
    { code: "KH00009", name: "이지은", district: "Quận 7", region: "HCMC-D7", tech: tech2.id, model: bidet, serial: "SA-J430-000021", lang: "ko", residency: "FOREIGN", passportNumber: "M12345678", nationality: "Korea" },
    { code: "KH00010", name: "Phan Thị Cẩm", district: "Quận 1", region: "HCMC-D1", tech: tech1.id, model: purifier, serial: "PTS-2100-000032", nationalId: "079123456710" },
    // ── Foreign B2C seeds (3) — covers KO/JA/EN nationalities. ──
    { code: "KH00018", name: "TANAKA HIROSHI", district: "Quận 1", region: "HCMC-D1", tech: tech1.id, model: purifier, serial: "PTS-2100-000050", lang: "en", residency: "FOREIGN", passportNumber: "TK0099887", nationality: "Japan" },
    { code: "KH00019", name: "EMILY JOHNSON", district: "Quận 2", region: "HCMC-D2", tech: tech1.id, model: bidet, serial: "SA-J430-000051", lang: "en", residency: "FOREIGN", passportNumber: "US7820011", nationality: "United States" },
    { code: "KH00020", name: "박지훈", district: "Quận 7", region: "HCMC-D7", tech: tech2.id, model: air, serial: "AC-700-000052", lang: "ko", residency: "FOREIGN", passportNumber: "M88990011", nationality: "Korea" },
  ];
  const b2cCustomers: Record<string, { id: string; code: string }> = {};
  for (const c of bulkB2c) {
    const cust = await prisma.customer.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        type: "B2C",
        name: c.name,
        residency: c.residency ?? "DOMESTIC",
        nationalId: c.residency === "FOREIGN" ? null : c.nationalId ?? null,
        passportNumber: c.residency === "FOREIGN" ? c.passportNumber ?? null : null,
        nationality: c.residency === "FOREIGN" ? c.nationality ?? null : null,
        address: `${c.district} address line`,
        district: c.district,
        city: c.region.startsWith("HN") ? "Hà Nội" : "TP. Hồ Chí Minh",
        preferredTechnicianId: c.tech,
        preferredRegion: c.region,
        contacts: {
          create: [
            {
              role: "CONTRACT_PARTY",
              scope: "CUSTOMER",
              isPrimary: false,
              name: c.name,
              phone1: `09015${c.code.slice(-5)}`,
              email: `${c.code.toLowerCase()}@example.com`,
              language: c.lang ?? "vi",
            },
          ],
        },
        equipment: {
          create: [
            {
              modelId: c.model.id,
              serialNumber: c.serial,
              installedAt: monthsFromNow(-Math.floor(Math.random() * 24) - 1),
              status: "ACTIVE",
              ownership: "COMPANY",
            },
          ],
        },
      },
    });
    b2cCustomers[c.code] = cust;
  }
  console.log(`  ✓ bulk B2C customers (${bulkB2c.length})`);

  // ─── Bulk B2B customers (KH00011–KH00014) ───────────────────────────
  const bulkB2b = [
    { code: "KH00011", name: "CÔNG TY CỔ PHẦN ABC FOODS", shortcode: "ABC", tax: "0301234501", region: "HCMC-D1", rep: "NGUYỄN VĂN HÙNG" },
    { code: "KH00012", name: "CÔNG TY TNHH XYZ LOGISTICS", shortcode: "XYZ", tax: "0301234502", region: "HCMC-D7", rep: "TRẦN THỊ MAI" },
    { code: "KH00013", name: "NGÂN HÀNG TMCP DELTA", shortcode: "DLT", tax: "0301234503", region: "HN-HK", rep: "LÊ QUANG HƯNG" },
    { code: "KH00014", name: "TRƯỜNG QUỐC TẾ GAMMA", shortcode: "GMA", tax: "0301234504", region: "HCMC-D3", rep: "PHẠM THỊ LAN ANH" },
    // New B2B seeds (3) — covering different industries + regions.
    { code: "KH00015", name: "CÔNG TY TNHH SAMSUNG VINA", shortcode: "SVN", tax: "0301234505", region: "HCMC-D2", rep: "KIM JONG SU" },
    { code: "KH00016", name: "CÔNG TY TNHH LOTTE MART VIỆT NAM", shortcode: "LMT", tax: "0301234506", region: "HCMC-D7", rep: "LEE HYUN WOO" },
    { code: "KH00017", name: "CÔNG TY CỔ PHẦN GIÁO DỤC FPT", shortcode: "FED", tax: "0301234507", region: "HN-HK", rep: "TRƯƠNG GIA BÌNH" },
  ];
  const b2bCustomers: Record<string, { id: string; code: string }> = {};
  for (const c of bulkB2b) {
    const cust = await prisma.customer.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        type: "B2B",
        name: c.name,
        shortcode: c.shortcode,
        taxCode: c.tax,
        representativeName: c.rep,
        residency: null,
        address: `HQ, ${c.region}`,
        city: c.region.startsWith("HN") ? "Hà Nội" : "TP. Hồ Chí Minh",
        preferredRegion: c.region,
        contacts: {
          create: [
            {
              role: "CONTRACT_PARTY",
              scope: "CUSTOMER",
              isPrimary: false,
              name: `Director ${c.shortcode}`,
              title: "Giám đốc",
              phone1: `09022${c.code.slice(-5)}`,
              email: `contract@${c.shortcode.toLowerCase()}.example.com`,
              language: "vi",
            },
            {
              role: "OPS_CONTACT",
              scope: "CUSTOMER",
              isPrimary: true,
              name: `Ops ${c.shortcode}`,
              title: "Quản lý Văn phòng",
              phone1: `09023${c.code.slice(-5)}`,
              email: `ops@${c.shortcode.toLowerCase()}.example.com`,
              language: "vi",
            },
            {
              role: "OPS_CONTACT",
              scope: "CUSTOMER",
              isPrimary: false,
              isAccountingContact: true,
              name: `Accounting ${c.shortcode}`,
              title: "Kế toán trưởng",
              phone1: `09024${c.code.slice(-5)}`,
              email: `accounting@${c.shortcode.toLowerCase()}.example.com`,
              language: "vi",
            },
          ],
        },
        equipment: {
          create: [
            {
              modelId: purifier.id,
              serialNumber: `PTS-2100-0001${c.code.slice(-2)}`,
              installedAt: monthsFromNow(-6),
              status: "ACTIVE",
              ownership: "COMPANY",
            },
            {
              modelId: air.id,
              serialNumber: `AC-700-0001${c.code.slice(-2)}`,
              installedAt: monthsFromNow(-6),
              status: "ACTIVE",
              ownership: "COMPANY",
            },
          ],
        },
      },
    });
    b2bCustomers[c.code] = cust;
  }
  console.log(`  ✓ bulk B2B customers (${bulkB2b.length})`);

  // ─── Contracts (covering all states) ────────────────────────────────
  // KH00001 B2C rental — ACTIVE, mid-term.
  const c1 = await prisma.contract.upsert({
    where: { contractNumber: "HD-20250615/SA-KH0001" },
    update: {},
    create: {
      contractNumber: "HD-20250615/SA-KH0001",
      customerId: b2c.id,
      type: "RENTAL",
      state: "ACTIVE",
      startDate: new Date("2025-06-15"),
      endDate: monthsFromNow(30),
      termMonths: 36,
      monthlyMaintenanceFee: 120_000,
      totalContractValue: 12_600_000,
      signedByCustomerAt: new Date("2025-06-15"),
      signedByCompanyAt: new Date("2025-06-15"),
      activatedAt: new Date("2025-06-15"),
      equipment: { create: [{ equipmentId: b2c.equipment[0].id, unitPrice: 350_000 }] },
    },
  });

  // KH00002 B2B rental — ACTIVE with an Appendix amendment (parent + revision).
  const c2parent = await prisma.contract.upsert({
    where: { contractNumber: "HD-20250801/SA-SHV" },
    update: {},
    create: {
      contractNumber: "HD-20250801/SA-SHV",
      customerId: b2b.id,
      type: "RENTAL",
      state: "AMENDED",
      startDate: new Date("2025-08-01"),
      endDate: monthsFromNow(33),
      termMonths: 36,
      monthlyMaintenanceFee: 240_000,
      totalContractValue: 25_200_000,
      signedByCustomerAt: new Date("2025-08-01"),
      signedByCompanyAt: new Date("2025-08-01"),
      activatedAt: new Date("2025-08-01"),
      equipment: { create: [{ equipmentId: b2bEq1.id, unitPrice: 350_000 }] },
    },
  });
  await prisma.contract.upsert({
    where: { contractNumber: "HD-20250901/SA-SHV" },
    update: {},
    create: {
      contractNumber: "HD-20250901/SA-SHV",
      customerId: b2b.id,
      type: "RENTAL",
      state: "ACTIVE",
      parentContractId: c2parent.id,
      amendmentRevision: 1,
      amendmentReason: "Thêm thiết bị cho chi nhánh Hà Nội",
      startDate: new Date("2025-09-01"),
      endDate: monthsFromNow(33),
      termMonths: 36,
      monthlyMaintenanceFee: 360_000,
      totalContractValue: 37_800_000,
      signedByCustomerAt: new Date("2025-09-01"),
      signedByCompanyAt: new Date("2025-09-01"),
      activatedAt: new Date("2025-09-01"),
    },
  });

  // KH00003 — rental COMPLETED then post-rental SALE (ownership transferred).
  await prisma.contract.upsert({
    where: { contractNumber: "HD-20220301/SA-KH0003" },
    update: {},
    create: {
      contractNumber: "HD-20220301/SA-KH0003",
      customerId: b2c2.id,
      type: "RENTAL",
      state: "COMPLETED",
      startDate: new Date("2022-03-01"),
      endDate: new Date("2025-03-01"),
      termMonths: 36,
      monthlyMaintenanceFee: 80_000,
      totalContractValue: 17_280_000,
      activatedAt: new Date("2022-03-01"),
    },
  });

  // KH00004 — SALE, ACTIVE (outright purchase).
  await prisma.contract.upsert({
    where: { contractNumber: "HD-20260101/SA-KH0004" },
    update: {},
    create: {
      contractNumber: "HD-20260101/SA-KH0004",
      customerId: b2cCustomers["KH00004"].id,
      type: "SALE",
      state: "ACTIVE",
      startDate: new Date("2026-01-01"),
      totalContractValue: 12_000_000,
      signedByCustomerAt: new Date("2026-01-01"),
      signedByCompanyAt: new Date("2026-01-01"),
      activatedAt: new Date("2026-01-01"),
    },
  });

  // KH00005 — DRAFT (not yet signed).
  await prisma.contract.upsert({
    where: { contractNumber: "HD-20260520/SA-KH0005" },
    update: {},
    create: {
      contractNumber: "HD-20260520/SA-KH0005",
      customerId: b2cCustomers["KH00005"].id,
      type: "RENTAL",
      state: "DRAFT",
      termMonths: 36,
      monthlyMaintenanceFee: 120_000,
    },
  });

  // KH00006 — PENDING_SIGNATURE.
  await prisma.contract.upsert({
    where: { contractNumber: "HD-20260525/SA-KH0006" },
    update: {},
    create: {
      contractNumber: "HD-20260525/SA-KH0006",
      customerId: b2cCustomers["KH00006"].id,
      type: "RENTAL",
      state: "PENDING_SIGNATURE",
      startDate: new Date("2026-05-25"),
      endDate: monthsFromNow(36),
      termMonths: 36,
      monthlyMaintenanceFee: 100_000,
      signedByCompanyAt: new Date("2026-05-25"),
    },
  });

  // KH00007 — TERMINATED early.
  await prisma.contract.upsert({
    where: { contractNumber: "HD-20251001/SA-KH0007" },
    update: {},
    create: {
      contractNumber: "HD-20251001/SA-KH0007",
      customerId: b2cCustomers["KH00007"].id,
      type: "RENTAL",
      state: "TERMINATED",
      startDate: new Date("2025-10-01"),
      endDate: monthsFromNow(30),
      termMonths: 36,
      monthlyMaintenanceFee: 150_000,
      activatedAt: new Date("2025-10-01"),
      terminatedAt: monthsFromNow(-1),
      terminationReason: "Khách hàng chuyển địa điểm ra nước ngoài",
    },
  });

  // KH00011 B2B — ACTIVE rental.
  await prisma.contract.upsert({
    where: { contractNumber: "HD-20251101/SA-ABC" },
    update: {},
    create: {
      contractNumber: "HD-20251101/SA-ABC",
      customerId: b2bCustomers["KH00011"].id,
      type: "RENTAL",
      state: "ACTIVE",
      startDate: new Date("2025-11-01"),
      endDate: monthsFromNow(35),
      termMonths: 36,
      monthlyMaintenanceFee: 220_000,
      totalContractValue: 22_680_000,
      signedByCustomerAt: new Date("2025-11-01"),
      signedByCompanyAt: new Date("2025-11-01"),
      activatedAt: new Date("2025-11-01"),
    },
  });

  // ─── Bulk contracts (state + customer-type + sale-type coverage) ──────
  // Covers DRAFT×3, PENDING×3, AMENDED×2, COMPLETED×3, TERMINATED×2,
  // CANCELLED×2 (= 15). Within those, 6 are B2B (≥5) and 6 are SALE (≥4).
  type BulkContract = {
    contractNumber: string;
    customerId: string;
    type: "RENTAL" | "SALE" | "MAINTENANCE";
    state: "DRAFT" | "PENDING_SIGNATURE" | "AMENDED" | "COMPLETED" | "TERMINATED" | "CANCELLED";
    startDate?: Date | null;
    endDate?: Date | null;
    termMonths?: number | null;
    monthlyFee?: number | null;
    totalValue?: number | null;
    signedByCompany?: Date | null;
    signedByCustomer?: Date | null;
    activatedAt?: Date | null;
    terminatedAt?: Date | null;
    terminationReason?: string | null;
    amendmentReason?: string | null;
  };
  const bulkContracts: BulkContract[] = [
    // ── DRAFT (3) ─────────────────────────────────────────────────────
    {
      contractNumber: "HD-20260601/SA-KH0008",
      customerId: b2cCustomers["KH00008"].id,
      type: "SALE",
      state: "DRAFT",
      totalValue: 9_000_000,
    },
    {
      contractNumber: "HD-20260605/SA-KH0009",
      customerId: b2cCustomers["KH00009"].id,
      type: "RENTAL",
      state: "DRAFT",
      termMonths: 36,
      monthlyFee: 130_000,
    },
    {
      contractNumber: "HD-20260610/SA-ABC",
      customerId: b2bCustomers["KH00011"].id,
      type: "SALE",
      state: "DRAFT",
      totalValue: 18_500_000,
    },

    // ── PENDING_SIGNATURE (3) — company signed, awaiting customer ───
    {
      contractNumber: "HD-20260612/SA-KH0010",
      customerId: b2cCustomers["KH00010"].id,
      type: "RENTAL",
      state: "PENDING_SIGNATURE",
      startDate: new Date("2026-06-15"),
      endDate: monthsFromNow(36),
      termMonths: 36,
      monthlyFee: 140_000,
      signedByCompany: new Date("2026-06-12"),
    },
    {
      contractNumber: "HD-20260615/SA-XYZ",
      customerId: b2bCustomers["KH00012"].id,
      type: "RENTAL",
      state: "PENDING_SIGNATURE",
      startDate: new Date("2026-06-20"),
      endDate: monthsFromNow(36),
      termMonths: 36,
      monthlyFee: 280_000,
      signedByCompany: new Date("2026-06-15"),
    },
    {
      contractNumber: "HD-20260618/SA-DLT",
      customerId: b2bCustomers["KH00013"].id,
      type: "SALE",
      state: "PENDING_SIGNATURE",
      startDate: new Date("2026-06-25"),
      totalValue: 32_000_000,
      signedByCompany: new Date("2026-06-18"),
    },

    // ── AMENDED (2) — fully active, marked AMENDED to surface state ──
    {
      contractNumber: "HD-20260120/SA-GMA",
      customerId: b2bCustomers["KH00014"].id,
      type: "RENTAL",
      state: "AMENDED",
      startDate: new Date("2026-01-20"),
      endDate: monthsFromNow(34),
      termMonths: 36,
      monthlyFee: 310_000,
      totalValue: 33_480_000,
      signedByCustomer: new Date("2026-01-20"),
      signedByCompany: new Date("2026-01-20"),
      activatedAt: new Date("2026-01-20"),
      amendmentReason: "Tăng số lượng thiết bị theo phụ lục",
    },
    {
      contractNumber: "HD-20260225/SA-KH0008",
      customerId: b2cCustomers["KH00008"].id,
      type: "RENTAL",
      state: "AMENDED",
      startDate: new Date("2026-02-25"),
      endDate: monthsFromNow(33),
      termMonths: 36,
      monthlyFee: 110_000,
      totalValue: 11_880_000,
      signedByCustomer: new Date("2026-02-25"),
      signedByCompany: new Date("2026-02-25"),
      activatedAt: new Date("2026-02-25"),
      amendmentReason: "Điều chỉnh phí định kỳ theo phụ lục",
    },

    // ── COMPLETED (3) — full lifecycle, term ended naturally ──────────
    {
      contractNumber: "HD-20230315/SA-KH0005",
      customerId: b2cCustomers["KH00005"].id,
      type: "RENTAL",
      state: "COMPLETED",
      startDate: new Date("2023-03-15"),
      endDate: new Date("2026-03-15"),
      termMonths: 36,
      monthlyFee: 100_000,
      totalValue: 10_800_000,
      signedByCustomer: new Date("2023-03-15"),
      signedByCompany: new Date("2023-03-15"),
      activatedAt: new Date("2023-03-15"),
    },
    {
      contractNumber: "HD-20230420/SA-KH0006",
      customerId: b2cCustomers["KH00006"].id,
      type: "SALE",
      state: "COMPLETED",
      startDate: new Date("2023-04-20"),
      totalValue: 8_500_000,
      signedByCustomer: new Date("2023-04-20"),
      signedByCompany: new Date("2023-04-20"),
      activatedAt: new Date("2023-04-20"),
    },
    {
      contractNumber: "HD-20230510/SA-XYZ",
      customerId: b2bCustomers["KH00012"].id,
      type: "SALE",
      state: "COMPLETED",
      startDate: new Date("2023-05-10"),
      totalValue: 22_000_000,
      signedByCustomer: new Date("2023-05-10"),
      signedByCompany: new Date("2023-05-10"),
      activatedAt: new Date("2023-05-10"),
    },

    // ── TERMINATED (2) — early termination with reason ────────────────
    {
      contractNumber: "HD-20250105/SA-KH0009",
      customerId: b2cCustomers["KH00009"].id,
      type: "RENTAL",
      state: "TERMINATED",
      startDate: new Date("2025-01-05"),
      endDate: monthsFromNow(20),
      termMonths: 36,
      monthlyFee: 120_000,
      signedByCustomer: new Date("2025-01-05"),
      signedByCompany: new Date("2025-01-05"),
      activatedAt: new Date("2025-01-05"),
      terminatedAt: monthsFromNow(-2),
      terminationReason: "Khách hàng phá sản, không thể tiếp tục thanh toán.",
    },
    {
      contractNumber: "HD-20250215/SA-ABC",
      customerId: b2bCustomers["KH00011"].id,
      type: "RENTAL",
      state: "TERMINATED",
      startDate: new Date("2025-02-15"),
      endDate: monthsFromNow(22),
      termMonths: 36,
      monthlyFee: 240_000,
      signedByCustomer: new Date("2025-02-15"),
      signedByCompany: new Date("2025-02-15"),
      activatedAt: new Date("2025-02-15"),
      terminatedAt: monthsFromNow(-3),
      terminationReason: "Doanh nghiệp đóng cửa chi nhánh, không cần thiết bị.",
    },

    // ── CANCELLED (2) — never activated, killed before sign-off ────────
    {
      contractNumber: "HD-20260301/SA-KH0010",
      customerId: b2cCustomers["KH00010"].id,
      type: "RENTAL",
      state: "CANCELLED",
      termMonths: 36,
      monthlyFee: 100_000,
    },
    {
      contractNumber: "HD-20260315/SA-DLT",
      customerId: b2bCustomers["KH00013"].id,
      type: "SALE",
      state: "CANCELLED",
      totalValue: 14_000_000,
    },
  ];

  for (const c of bulkContracts) {
    await prisma.contract.upsert({
      where: { contractNumber: c.contractNumber },
      update: {},
      create: {
        contractNumber: c.contractNumber,
        customerId: c.customerId,
        type: c.type,
        state: c.state,
        startDate: c.startDate ?? null,
        endDate: c.endDate ?? null,
        termMonths: c.termMonths ?? null,
        monthlyMaintenanceFee: c.monthlyFee ?? null,
        totalContractValue: c.totalValue ?? null,
        signedByCustomerAt: c.signedByCustomer ?? null,
        signedByCompanyAt: c.signedByCompany ?? null,
        activatedAt: c.activatedAt ?? null,
        terminatedAt: c.terminatedAt ?? null,
        terminationReason: c.terminationReason ?? null,
        amendmentReason: c.amendmentReason ?? null,
      },
    });
  }

  console.log(
    `  ✓ contracts (9 anchor + ${bulkContracts.length} bulk = ${9 + bulkContracts.length}: full state matrix incl. 6 B2B and 6 SALE)`,
  );

  // ─── Service requests (covering all states) ─────────────────────────
  const b2cPrimaryContact = b2c.contacts.find((c) => c.role === "CONTRACT_PARTY")!;
  // Today's PENDING_REVIEW SR with a "preferred visit time" set — exercises
  // the office approval modal's auto-fill of scheduledFor + the new
  // preferred-time read-only display every time the dev DB is reseeded.
  const todayPreferred = at(daysFromNow(0), 14);
  const srSeed = [
    { code: "SR-00001", customerId: b2c.id, contactId: b2cPrimaryContact.id, equipmentId: b2c.equipment[0].id, type: "INSPECTION" as const, isPaid: false, state: "PENDING_REVIEW" as const, desc: "Nước chảy yếu, nhờ kiểm tra giúp.", preferredVisitAt: todayPreferred },
    { code: "SR-00002", customerId: b2c.id, contactId: b2cPrimaryContact.id, equipmentId: b2c.equipment[0].id, type: "REPAIR" as const, isPaid: true, state: "APPROVED" as const, desc: "Máy kêu to khi lọc nước.", price: 350_000 },
    { code: "SR-00003", customerId: b2cCustomers["KH00004"].id, type: "PART_REPLACEMENT" as const, isPaid: true, state: "REJECTED" as const, desc: "Thay lõi lọc sớm hơn lịch.", reject: "Lõi lọc vẫn trong hạn, chưa cần thay." },
    { code: "SR-00004", customerId: b2cCustomers["KH00006"].id, type: "RELOCATION" as const, isPaid: true, state: "SCHEDULED" as const, desc: "Chuyển máy sang phòng bếp mới.", price: 200_000 },
    { code: "SR-00005", customerId: b2c2.id, equipmentId: b2c2.equipment[0].id, type: "INSPECTION" as const, isPaid: false, state: "COMPLETED" as const, desc: "Định kỳ kiểm tra bồn cầu thông minh." },
  ];
  const serviceRequests: Record<string, { id: string }> = {};
  for (const sr of srSeed) {
    const preferredVisitAt =
      "preferredVisitAt" in sr ? sr.preferredVisitAt : null;
    const created = await prisma.serviceRequest.upsert({
      where: { code: sr.code },
      // Roll forward time-sensitive fields (preferredVisitAt + submittedAt)
      // on re-seed so SR-00001 always shows up as "today's request".
      update: preferredVisitAt
        ? { preferredVisitAt, submittedAt: new Date() }
        : {},
      create: {
        code: sr.code,
        customerId: sr.customerId,
        contactId: "contactId" in sr ? sr.contactId : undefined,
        equipmentId: "equipmentId" in sr ? sr.equipmentId : undefined,
        type: sr.type,
        isPaid: sr.isPaid,
        state: sr.state,
        description: sr.desc,
        preferredVisitAt: preferredVisitAt ?? undefined,
        approvedPrice: "price" in sr ? sr.price : undefined,
        approvedDate: sr.state === "APPROVED" || sr.state === "SCHEDULED" ? daysFromNow(2) : undefined,
        rejectionReason: "reject" in sr ? sr.reject : undefined,
        decidedAt: sr.state !== "PENDING_REVIEW" ? daysFromNow(-1) : undefined,
        decidedById: sr.state !== "PENDING_REVIEW" ? staff.id : undefined,
      },
    });
    serviceRequests[sr.code] = created;
  }
  console.log(`  ✓ service requests (${srSeed.length})`);

  // ─── Visits (covering all states + lead/collaborator) ───────────────
  async function ensureVisit(id: string, data: Parameters<typeof prisma.visit.create>[0]["data"]) {
    const existing = await prisma.visit.findUnique({ where: { id } });
    if (existing) return existing;
    return prisma.visit.create({ data: { ...data, id } });
  }

  // Variant of ensureVisit that always re-syncs the visit's photos
  // field. Used for the showcase fixture (seed-visit-001) so the
  // customer portal demo has photos to render even when the DB
  // already has the visit row from an earlier seed run.
  async function ensureVisitWithPhotos(
    id: string,
    data: Parameters<typeof prisma.visit.create>[0]["data"],
  ) {
    const v = await ensureVisit(id, data);
    if (data.photos !== undefined) {
      await prisma.visit.update({
        where: { id },
        data: { photos: data.photos },
      });
    }
    return v;
  }

  // Past completed periodic inspection (KH00001).
  const vCompleted = await ensureVisitWithPhotos("seed-visit-001", {
    customerId: b2c.id,
    equipmentId: b2c.equipment[0].id,
    type: "PERIODIC_INSPECTION",
    state: "COMPLETED",
    scheduledFor: at(daysFromNow(-30), 10),
    scheduledWindow: "morning",
    leadTechnicianId: tech1.id,
    findings: "Đã vệ sinh máy, thay lõi Sediment. Máy hoạt động tốt.",
    startedAt: at(daysFromNow(-30), 10, 15),
    completedAt: at(daysFromNow(-30), 11, 0),
    partsReplaced: { parts: [{ type: "Sediment", qty: 1 }] },
    // Two placeholder field photos so the customer portal visit detail
    // has something to render in the "현장 사진" section. picsum.photos
    // serves stable images per seed string so the IDs are reproducible
    // across re-seeds. In production these come from the technician's
    // visit-complete upload flow.
    photos: [
      {
        url: "https://picsum.photos/seed/seed-visit-001-before/800/600",
        takenAt: at(daysFromNow(-30), 10, 20).toISOString(),
        caption: "Tình trạng trước bảo trì",
      },
      {
        url: "https://picsum.photos/seed/seed-visit-001-after/800/600",
        takenAt: at(daysFromNow(-30), 10, 55).toISOString(),
        caption: "Sau khi thay lõi và vệ sinh",
      },
    ],
  });

  // Today — SCHEDULED periodic inspection (KH00010), tech1 lead + collaborator.
  await ensureVisit("seed-visit-002", {
    customerId: b2cCustomers["KH00010"].id,
    type: "PERIODIC_INSPECTION",
    state: "SCHEDULED",
    scheduledFor: at(daysFromNow(0), 14),
    scheduledWindow: "14:00-16:00",
    leadTechnicianId: tech1.id,
    collaboratorTechnicianIds: [techs[4].id],
  });

  // Tomorrow — SUGGESTED (scheduler proposed, awaiting office confirm).
  await ensureVisit("seed-visit-003", {
    customerId: b2cCustomers["KH00005"].id,
    type: "INSTALLATION",
    state: "SUGGESTED",
    scheduledFor: at(daysFromNow(1), 9),
    scheduledWindow: "morning",
    leadTechnicianId: tech2.id,
  });

  // In progress now (KH00002 B2B HCMC site).
  await ensureVisit("seed-visit-004", {
    customerId: b2b.id,
    siteId: hcmcSite.id,
    equipmentId: b2bEq1.id,
    type: "REPAIR",
    state: "IN_PROGRESS",
    scheduledFor: at(daysFromNow(0), 9),
    scheduledWindow: "morning",
    leadTechnicianId: tech1.id,
    collaboratorTechnicianIds: [tech3.id],
    startedAt: at(daysFromNow(0), 9, 20),
    serviceRequestId: serviceRequests["SR-00002"].id,
  });

  // Failed / no-show (KH00007).
  await ensureVisit("seed-visit-005", {
    customerId: b2cCustomers["KH00007"].id,
    type: "PERIODIC_INSPECTION",
    state: "FAILED_NO_SHOW",
    scheduledFor: at(daysFromNow(-3), 15),
    scheduledWindow: "afternoon",
    leadTechnicianId: tech3.id,
    failureReason: "Khách không có mặt, gọi điện không liên lạc được.",
  });

  // Completed inspection tied to a completed service request (KH00003).
  const vCompleted2 = await ensureVisit("seed-visit-006", {
    customerId: b2c2.id,
    equipmentId: b2c2.equipment[0].id,
    type: "PERIODIC_INSPECTION",
    state: "COMPLETED",
    scheduledFor: at(daysFromNow(-10), 13),
    leadTechnicianId: tech2.id,
    findings: "Kiểm tra định kỳ, không có vấn đề.",
    startedAt: at(daysFromNow(-10), 13, 5),
    completedAt: at(daysFromNow(-10), 13, 45),
    serviceRequestId: serviceRequests["SR-00005"].id,
  });

  // ─── Bulk visits per state (~50 total, ~7 per VisitState) ──────────────
  // Seeds enough volume for filter / dashboard widgets to surface meaningful
  // numbers in dev. Reuses bulk B2C/B2B customers + tech pool above.
  //
  // Each pool entry carries the customer's first equipmentId — the field
  // visit-detail's equipment + work-scope panels read it, so without this
  // link technicians see an empty equipment block in dev. We fetch the
  // ids in one query (the customers were just upserted above).
  const bulkPoolCustomerIds: string[] = [
    b2cCustomers["KH00004"].id,
    b2cCustomers["KH00005"].id,
    b2cCustomers["KH00006"].id,
    b2cCustomers["KH00007"].id,
    b2cCustomers["KH00008"].id,
    b2cCustomers["KH00009"].id,
    b2cCustomers["KH00010"].id,
    b2bCustomers["KH00011"].id,
    b2bCustomers["KH00012"].id,
    b2bCustomers["KH00013"].id,
    b2bCustomers["KH00014"].id,
  ];
  const firstEquipmentRows = await prisma.equipment.findMany({
    where: { customerId: { in: bulkPoolCustomerIds } },
    select: { id: true, customerId: true },
    orderBy: { createdAt: "asc" },
  });
  const firstEquipmentByCustomer = new Map<string, string>();
  for (const e of firstEquipmentRows) {
    if (!firstEquipmentByCustomer.has(e.customerId)) {
      firstEquipmentByCustomer.set(e.customerId, e.id);
    }
  }
  const bulkVisitPool: Array<{ customerId: string; equipmentId?: string }> =
    bulkPoolCustomerIds.map((customerId) => ({
      customerId,
      equipmentId: firstEquipmentByCustomer.get(customerId),
    }));
  const visitTypePool = ["PERIODIC_INSPECTION", "FILTER_REPLACEMENT", "REPAIR", "INSTALLATION"] as const;
  const stateBuckets: Array<{
    state: "SUGGESTED" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED_NO_SHOW" | "RESCHEDULED" | "CANCELLED";
    count: number;
    dayOffset: (i: number) => number; // signed: negative = past, positive = future
  }> = [
    { state: "SUGGESTED", count: 7, dayOffset: (i) => 2 + i },
    { state: "SCHEDULED", count: 7, dayOffset: (i) => 1 + (i % 5) },
    { state: "IN_PROGRESS", count: 7, dayOffset: () => 0 },
    { state: "COMPLETED", count: 8, dayOffset: (i) => -2 - i },
    { state: "FAILED_NO_SHOW", count: 7, dayOffset: (i) => -3 - i },
    { state: "RESCHEDULED", count: 7, dayOffset: (i) => -1 - i },
    { state: "CANCELLED", count: 7, dayOffset: (i) => -4 - i },
  ];
  let bulkVisitCounter = 0;
  for (const bucket of stateBuckets) {
    for (let i = 0; i < bucket.count; i++) {
      const targetCustomer = bulkVisitPool[bulkVisitCounter % bulkVisitPool.length];
      const techPick = techs[bulkVisitCounter % techs.length];
      const collabPick = techs[(bulkVisitCounter + 1) % techs.length];
      const vType = visitTypePool[bulkVisitCounter % visitTypePool.length];
      const dayOff = bucket.dayOffset(i);
      const hourBase = 8 + (bulkVisitCounter % 8);
      const id = `seed-visit-bulk-${String(bulkVisitCounter + 100).padStart(3, "0")}`;
      bulkVisitCounter++;

      const baseData: Parameters<typeof prisma.visit.create>[0]["data"] = {
        customerId: targetCustomer.customerId,
        equipmentId: targetCustomer.equipmentId,
        type: vType,
        state: bucket.state,
        scheduledFor: at(daysFromNow(dayOff), hourBase),
        scheduledWindow: hourBase < 12 ? "morning" : "afternoon",
        leadTechnicianId: techPick.id,
        collaboratorTechnicianIds: i % 3 === 0 ? [collabPick.id] : [],
      };

      if (bucket.state === "COMPLETED") {
        baseData.startedAt = at(daysFromNow(dayOff), hourBase, 10);
        baseData.completedAt = at(daysFromNow(dayOff), hourBase + 1, 0);
        baseData.findings = `Bulk seed visit #${bulkVisitCounter} — ${vType.toLowerCase()} completed.`;
      } else if (bucket.state === "IN_PROGRESS") {
        baseData.startedAt = at(daysFromNow(dayOff), hourBase, 10);
      } else if (bucket.state === "FAILED_NO_SHOW") {
        baseData.failureReason = "Khách không có mặt theo lịch hẹn.";
      } else if (bucket.state === "RESCHEDULED") {
        baseData.failureReason = "Khách yêu cầu dời lịch sang tuần sau.";
      } else if (bucket.state === "CANCELLED") {
        baseData.failureReason = "Khách hủy do thay đổi kế hoạch.";
      }

      await ensureVisit(id, baseData);
    }
  }

  // ─── Daily visits (past 60 days + today + next 30 days, one per day) ──
  // Guarantees ≥1 visit per calendar day across a 91-day window so the
  // calendar / dashboard widgets, reporting filters, and date-range
  // analytics always have continuous data in dev. Past days land as
  // COMPLETED with findings; today + future as SCHEDULED so cron jobs
  // (D-1 reminder) + today/upcoming mobile screens have material.
  // Round-robins through bulk customers and the technician pool;
  // alternates visit type day by day.
  let dailyVisitCounter = 0;
  for (let dayOff = -60; dayOff <= 30; dayOff++) {
    const targetCustomer = bulkVisitPool[dailyVisitCounter % bulkVisitPool.length];
    const techPick = techs[dailyVisitCounter % techs.length];
    const vType = visitTypePool[dailyVisitCounter % visitTypePool.length];
    // Spread starting hours 8–16 so the day-view doesn't look identical.
    const hourBase = 8 + (dailyVisitCounter % 9);
    const isPast = dayOff < 0;
    const id = `seed-visit-daily-${dayOff < 0 ? "p" : "f"}${String(Math.abs(dayOff)).padStart(2, "0")}`;
    const data: Parameters<typeof prisma.visit.create>[0]["data"] = {
      customerId: targetCustomer.customerId,
      equipmentId: targetCustomer.equipmentId,
      type: vType,
      state: isPast ? "COMPLETED" : "SCHEDULED",
      scheduledFor: at(daysFromNow(dayOff), hourBase),
      scheduledWindow: hourBase < 12 ? "morning" : "afternoon",
      leadTechnicianId: techPick.id,
    };
    if (isPast) {
      data.startedAt = at(daysFromNow(dayOff), hourBase, 10);
      data.completedAt = at(daysFromNow(dayOff), hourBase + 1, 5);
      data.findings = `Daily seed visit (${dayOff}) — ${vType.toLowerCase()} completed.`;
    }
    await ensureVisit(id, data);
    dailyVisitCounter++;
  }

  console.log(
    `  ✓ visits (6 anchor + ${bulkVisitCounter} bulk + ${dailyVisitCounter} daily = ${6 + bulkVisitCounter + dailyVisitCounter} total across all VisitState values)`,
  );

  // ─── Payments (covering all states) ─────────────────────────────────
  async function ensurePayment(id: string, data: Parameters<typeof prisma.payment.create>[0]["data"]) {
    const existing = await prisma.payment.findUnique({ where: { id } });
    if (existing) return existing;
    return prisma.payment.create({ data: { ...data, id } });
  }

  // RECONCILED — collected on the completed visit, deposited & approved.
  await ensurePayment("seed-pay-001", {
    customerId: b2c.id,
    contractId: c1.id,
    visitId: vCompleted.id,
    collectedById: tech1.id,
    method: "CASH",
    state: "RECONCILED",
    expectedAmount: 120_000,
    actualAmount: 120_000,
    collectedAt: at(daysFromNow(-30), 11),
    handedOverAt: at(daysFromNow(-29), 9),
    reconciledAt: at(daysFromNow(-28), 16),
  });

  // COLLECTED — tech has cash, not yet deposited.
  await ensurePayment("seed-pay-002", {
    customerId: b2c2.id,
    visitId: vCompleted2.id,
    collectedById: tech2.id,
    method: "CASH",
    state: "COLLECTED",
    expectedAmount: 80_000,
    actualAmount: 80_000,
    collectedAt: at(daysFromNow(-10), 13, 45),
  });

  // EXPECTED — invoice issued, awaiting payment, due soon.
  await ensurePayment("seed-pay-003", {
    customerId: b2bCustomers["KH00011"].id,
    method: "BANK_TRANSFER",
    state: "EXPECTED",
    expectedAmount: 220_000,
    actualAmount: 0,
    dueDate: daysFromNow(5),
  });

  // OVERDUE_D7 / D14 / D30 — escalation ladder.
  await ensurePayment("seed-pay-004", {
    customerId: b2cCustomers["KH00004"].id,
    method: "CASH",
    state: "OVERDUE_D7",
    expectedAmount: 120_000,
    actualAmount: 0,
    dueDate: daysFromNow(-7),
  });
  await ensurePayment("seed-pay-005", {
    customerId: b2cCustomers["KH00008"].id,
    method: "BANK_TRANSFER",
    state: "OVERDUE_D14",
    expectedAmount: 350_000,
    actualAmount: 0,
    dueDate: daysFromNow(-14),
  });
  await ensurePayment("seed-pay-006", {
    customerId: b2cCustomers["KH00007"].id,
    method: "CASH",
    state: "OVERDUE_D30",
    expectedAmount: 150_000,
    actualAmount: 0,
    dueDate: daysFromNow(-30),
  });

  // HANDED_OVER — deposited at office, awaiting manager reconciliation.
  const payHandedOver = await ensurePayment("seed-pay-007", {
    customerId: b2bCustomers["KH00012"].id,
    method: "BANK_TRANSFER",
    state: "HANDED_OVER",
    expectedAmount: 600_000,
    actualAmount: 600_000,
    reference: "VCB-20260527-0012",
    collectedAt: daysFromNow(-2),
    handedOverAt: daysFromNow(-1),
  });

  // RECONCILED B2B with NO tax invoice yet — surfaces the "tax invoice pending"
  // queue for office accounting to upload Viettel-generated PDFs.
  await ensurePayment("seed-pay-008", {
    customerId: b2b.id,
    method: "BANK_TRANSFER",
    state: "RECONCILED",
    expectedAmount: 1_500_000,
    actualAmount: 1_500_000,
    reference: "VCB-20260520-0008",
    collectedAt: daysFromNow(-11),
    handedOverAt: daysFromNow(-10),
    reconciledAt: daysFromNow(-9),
  });
  await ensurePayment("seed-pay-009", {
    customerId: b2bCustomers["KH00013"].id,
    method: "BANK_TRANSFER",
    state: "RECONCILED",
    expectedAmount: 880_000,
    actualAmount: 880_000,
    reference: "VCB-20260522-0009",
    collectedAt: daysFromNow(-9),
    handedOverAt: daysFromNow(-8),
    reconciledAt: daysFromNow(-7),
  });
  await ensurePayment("seed-pay-010", {
    customerId: b2bCustomers["KH00014"].id,
    method: "BANK_TRANSFER",
    state: "RECONCILED",
    expectedAmount: 2_100_000,
    actualAmount: 2_100_000,
    reference: "VCB-20260525-0010",
    collectedAt: daysFromNow(-6),
    handedOverAt: daysFromNow(-5),
    reconciledAt: daysFromNow(-4),
  });

  console.log(`  ✓ payments (10: expected/collected/handed-over/reconciled×4/overdue×3)`);

  // ─── Tax invoices (B2B only) ────────────────────────────────────────
  await prisma.taxInvoice.upsert({
    where: { paymentId: payHandedOver.id },
    update: {},
    create: {
      paymentId: payHandedOver.id,
      invoiceNumber: "00012345",
      invoiceDate: daysFromNow(-1),
      invoiceProvider: "MANUAL_UPLOAD",
      invoicePdfUploadedAt: daysFromNow(-1),
      pdfStorageKey: "uploads/tax-invoices/00012345.pdf",
    },
  });
  console.log(`  ✓ tax invoices (1)`);

  // ─── Notification logs (sample across templates/channels) ───────────
  async function ensureNotification(id: string, data: Parameters<typeof prisma.notificationLog.create>[0]["data"]) {
    const existing = await prisma.notificationLog.findUnique({ where: { id } });
    if (existing) return existing;
    return prisma.notificationLog.create({ data: { ...data, id } });
  }
  const b2cOps = b2c.contacts.find((c) => c.role === "OPS_CONTACT")!;
  await ensureNotification("seed-notif-001", {
    customerId: b2c.id,
    contactId: b2cOps.id,
    templateCode: "SMS_VISIT_REMINDER",
    channel: "SMS",
    locale: "vi",
    provider: "mock",
    recipient: b2cOps.phone1,
    status: "MOCKED",
    segmentsUsed: 1,
    sentAt: daysFromNow(-1),
    payload: { body: "Seoul Aqua: lịch bảo trì ngày mai 14:00." },
  });
  await ensureNotification("seed-notif-002", {
    customerId: b2c.id,
    contactId: b2cPrimaryContact.id,
    templateCode: "SMS_PORTAL_WELCOME",
    channel: "SMS",
    locale: "vi",
    provider: "mock",
    recipient: b2cPrimaryContact.phone1,
    status: "MOCKED",
    segmentsUsed: 2,
    sentAt: daysFromNow(-40),
    payload: { body: "Chào mừng đến cổng khách hàng Seoul Aqua. Mật khẩu tạm: ********" },
  });
  await ensureNotification("seed-notif-003", {
    customerId: b2c2.id,
    contactId: b2c2.contacts[0].id,
    templateCode: "EMAIL_VISIT_COMPLETED",
    channel: "EMAIL",
    locale: "ko",
    provider: "mock",
    recipient: b2c2.contacts[0].email!,
    status: "MOCKED",
    sentAt: daysFromNow(-10),
    payload: { subject: "방문 완료 안내", body: "정기 점검이 완료되었습니다." },
  });
  console.log(`  ✓ notification logs (3)`);

  // ─── System settings (scheduler weights + retention knobs) ──────────
  const settings: Array<{ key: string; value: Prisma.InputJsonValue }> = [
    { key: "scheduler.weights", value: { preferredTech: 100, regionMatch: 50, dailyLoadBalance: 25 } },
    { key: "audit.retentionMonths", value: 24 },
    { key: "backup.dailyTimeVST", value: "03:00" },
    // Company HQ phone — admin-editable, single source of truth for the
    // {hq_phone} notification placeholder + the mobile "Call HQ" button.
    { key: "company.hqPhone", value: "028-2225-3939" },
    // Company tax info — used when generating contracts and tax invoices.
    // Editable at /admin/company-contact → 세무 정보 section.
    {
      key: "company.taxInfo",
      value: {
        legalName:
          "CÔNG TY TNHH MỘT THÀNH VIÊN THƯƠNG MẠI VÀ DỊCH VỤ ĐẠI Á",
        address:
          "Số 47 Đường Hoàng Trọng Mậu, Khu dân cư Him Lam, Phường Tân Hưng, TP Hồ Chí Minh, Việt Nam",
        representativeName: "CHOI ONE HO",
        taxCode: "0309395579",
      },
    },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, updatedById: admin.id },
      create: { key: s.key, value: s.value, updatedById: admin.id },
    });
  }
  console.log(`  ✓ system settings (${settings.length})`);

  console.log("\nDone seeding.");
  console.log("\nLogin credentials (dev only) — phone is the login key:");
  console.log("  admin    phone 012345678   / pw 12341234");
  console.log("  manager  phone 0123456781  / pw 12341234");
  console.log("  staff    phone 0123456782  / pw 12341234");
  console.log("  staff2   phone 0123456785  / pw 12341234");
  console.log("  tech1    phone 0123456783  / pw 12341234 (HCMC-D1)");
  console.log("  tech2    phone 0123456784  / pw 12341234 (HCMC-D7)");
  console.log("  tech3    phone 0123456786  / pw 12341234 (HCMC-D3)");
  console.log("  tech4    phone 0123456787  / pw 12341234 (HN-HK)");
  console.log("  tech5    phone 0123456788  / pw 12341234 (HCMC-D1)");
  console.log("\nPortal credentials (4 accounts, all pw portal1234):");
  console.log("  KH00001 CP   phone 0901234567 / vi / mustChange=true  (Nguyễn Thị Lan, B2C anchor)");
  console.log("  KH00002 CP   phone 0901112233 / vi / mustChange=true  (Trần Văn Minh, B2B 사장님)");
  console.log("  KH00002 OPS  phone 0901112234 / vi / mustChange=true  (Lê Thị Mai, B2B 운영담당)");
  console.log("  KH00003 CP   phone 0901555000 / ko / mustChange=false (김민수, 한국어 — 바로 진입)");
  console.log("\nData volume: 14 customers, 24 contracts, 5 service requests, 147 visits, 10 payments.");
}

main()
  .then(() => prisma.$disconnect().then(() => pool.end()))
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
