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
  const seoulAquaBrand = brandsByName.get("Seoul Aqua")!;
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
  // Each model is linked to a ProductCategory via categoryId AND keeps the
  // legacy `category` enum during the gradual migration. The `filterPolicy`
  // JSON is also retained as a fallback for code paths that haven't yet
  // moved to the Consumable model.
  const purifier = await prisma.equipmentModel.upsert({
    where: { modelCode: "PTS-2100" },
    update: {
      categoryId: categoriesByCode.get("WATER_PURIFIER")?.id,
      brandId: seoulAquaBrand.id,
      displayNameKo: "PTS-2100",
      displayNameVi: "PTS-2100",
      displayNameEn: "PTS-2100",
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
    },
    create: {
      modelCode: "PTS-2100",
      name: "PTS-2100 Water Purifier",
      displayNameKo: "PTS-2100",
      displayNameVi: "PTS-2100",
      displayNameEn: "PTS-2100",
      brandId: seoulAquaBrand.id,
      category: "WATER_PURIFIER",
      categoryId: categoriesByCode.get("WATER_PURIFIER")?.id,
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
      retailPrice: 8_500_000,
      monthlyRentalPrice: 350_000,
      monthlyMaintenancePrice: 120_000,
      filterPolicy: {
        filters: [
          { type: "Sediment", replaceEveryDays: 90 },
          { type: "Pre-Carbon", replaceEveryDays: 180 },
          { type: "RO Membrane", replaceEveryDays: 730 },
          { type: "Post-Carbon", replaceEveryDays: 365 },
        ],
      },
    },
  });
  const purifierPro = await prisma.equipmentModel.upsert({
    where: { modelCode: "PTS-3500" },
    update: {
      categoryId: categoriesByCode.get("WATER_PURIFIER")?.id,
      brandId: seoulAquaBrand.id,
      displayNameKo: "PTS-3500",
      displayNameVi: "PTS-3500",
      displayNameEn: "PTS-3500",
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
    },
    create: {
      modelCode: "PTS-3500",
      name: "PTS-3500 Hot/Cold Water Purifier",
      displayNameKo: "PTS-3500",
      displayNameVi: "PTS-3500",
      displayNameEn: "PTS-3500",
      brandId: seoulAquaBrand.id,
      category: "WATER_PURIFIER",
      categoryId: categoriesByCode.get("WATER_PURIFIER")?.id,
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
      retailPrice: 13_500_000,
      monthlyRentalPrice: 520_000,
      monthlyMaintenancePrice: 150_000,
      filterPolicy: {
        filters: [
          { type: "Sediment", replaceEveryDays: 90 },
          { type: "Pre-Carbon", replaceEveryDays: 180 },
          { type: "RO Membrane", replaceEveryDays: 730 },
          { type: "Post-Carbon", replaceEveryDays: 365 },
        ],
      },
    },
  });
  const bidet = await prisma.equipmentModel.upsert({
    where: { modelCode: "SA-J430" },
    update: {
      categoryId: categoriesByCode.get("BIDET")?.id,
      brandId: seoulAquaBrand.id,
      displayNameKo: "SA-J430",
      displayNameVi: "SA-J430",
      displayNameEn: "SA-J430",
      inspectionEveryMonths: 6,
      warrantyMonths: 12,
    },
    create: {
      modelCode: "SA-J430",
      name: "SA-J430 Smart Bidet",
      displayNameKo: "SA-J430",
      displayNameVi: "SA-J430",
      displayNameEn: "SA-J430",
      brandId: seoulAquaBrand.id,
      category: "BIDET",
      categoryId: categoriesByCode.get("BIDET")?.id,
      inspectionEveryMonths: 6,
      warrantyMonths: 12,
      retailPrice: 12_000_000,
      monthlyRentalPrice: 480_000,
      monthlyMaintenancePrice: 80_000,
      filterPolicy: {
        filters: [{ type: "Water Filter", replaceEveryDays: 365 }],
      },
    },
  });
  const air = await prisma.equipmentModel.upsert({
    where: { modelCode: "AC-700" },
    update: {
      categoryId: categoriesByCode.get("AIR_PURIFIER")?.id,
      brandId: seoulAquaBrand.id,
      displayNameKo: "AC-700",
      displayNameVi: "AC-700",
      displayNameEn: "AC-700",
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
    },
    create: {
      modelCode: "AC-700",
      name: "AC-700 Air Purifier",
      displayNameKo: "AC-700",
      displayNameVi: "AC-700",
      displayNameEn: "AC-700",
      brandId: seoulAquaBrand.id,
      category: "AIR_PURIFIER",
      categoryId: categoriesByCode.get("AIR_PURIFIER")?.id,
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
      retailPrice: 6_000_000,
      monthlyRentalPrice: 280_000,
      monthlyMaintenancePrice: 100_000,
      filterPolicy: {
        filters: [
          { type: "HEPA", replaceEveryDays: 365 },
          { type: "Carbon", replaceEveryDays: 180 },
        ],
      },
    },
  });

  // ─── Additional equipment models (representative slice of the PDF) ──
  // Phase 2 seeds a representative model per new category so the catalog
  // UI shows non-trivial data. The remaining ~50 PDF models can be added
  // via the admin UI without further code changes.
  const purifierRoTop = await prisma.equipmentModel.upsert({
    where: { modelCode: "PTS-4000T" },
    update: {
      categoryId: categoriesByCode.get("HOT_COLD_PURIFIER")?.id,
      brandId: seoulAquaBrand.id,
    },
    create: {
      modelCode: "PTS-4000T",
      name: "PTS-4000T Hot/Cold Purifier",
      displayNameKo: "PTS-4000T",
      displayNameVi: "PTS-4000T",
      displayNameEn: "PTS-4000T",
      brandId: seoulAquaBrand.id,
      category: "WATER_PURIFIER",
      categoryId: categoriesByCode.get("HOT_COLD_PURIFIER")?.id,
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
      retailPrice: 16_500_000,
      monthlyRentalPrice: 620_000,
      monthlyMaintenancePrice: 180_000,
    },
  });
  const purifierRoChp = await prisma.equipmentModel.upsert({
    where: { modelCode: "CHP-590R" },
    update: {
      categoryId: categoriesByCode.get("RO_HOT_COLD_PURIFIER")?.id,
      brandId: seoulAquaBrand.id,
    },
    create: {
      modelCode: "CHP-590R",
      name: "CHP-590R RO Hot/Cold Purifier",
      displayNameKo: "CHP-590R",
      displayNameVi: "CHP-590R",
      displayNameEn: "CHP-590R",
      brandId: seoulAquaBrand.id,
      category: "WATER_PURIFIER",
      categoryId: categoriesByCode.get("RO_HOT_COLD_PURIFIER")?.id,
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
      retailPrice: 18_500_000,
      monthlyRentalPrice: 720_000,
      monthlyMaintenancePrice: 200_000,
    },
  });
  const airCa5000 = await prisma.equipmentModel.upsert({
    where: { modelCode: "CA-5000W" },
    update: {
      categoryId: categoriesByCode.get("AIR_PURIFIER")?.id,
      brandId: seoulAquaBrand.id,
    },
    create: {
      modelCode: "CA-5000W",
      name: "CA-5000W Air Purifier",
      displayNameKo: "CA-5000W",
      displayNameVi: "CA-5000W",
      displayNameEn: "CA-5000W",
      brandId: seoulAquaBrand.id,
      category: "AIR_PURIFIER",
      categoryId: categoriesByCode.get("AIR_PURIFIER")?.id,
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
      retailPrice: 7_200_000,
      monthlyRentalPrice: 320_000,
      monthlyMaintenancePrice: 110_000,
    },
  });
  const dehumDxth = await prisma.equipmentModel.upsert({
    where: { modelCode: "DXTH120-NEK" },
    update: {
      categoryId: categoriesByCode.get("HOME_DEHUMIDIFIER")?.id,
      brandId: seoulAquaBrand.id,
    },
    create: {
      modelCode: "DXTH120-NEK",
      name: "DXTH120-NEK Home Dehumidifier",
      displayNameKo: "DXTH120-NEK",
      displayNameVi: "DXTH120-NEK",
      displayNameEn: "DXTH120-NEK",
      brandId: seoulAquaBrand.id,
      category: "OTHER",
      categoryId: categoriesByCode.get("HOME_DEHUMIDIFIER")?.id,
      inspectionEveryMonths: 3,
      warrantyMonths: 12,
      retailPrice: 5_400_000,
    },
  });
  const iceFsm30 = await prisma.equipmentModel.upsert({
    where: { modelCode: "FSM30" },
    update: {
      categoryId: categoriesByCode.get("ICE_MAKER")?.id,
      brandId: seoulAquaBrand.id,
    },
    create: {
      modelCode: "FSM30",
      name: "FSM30 Ice Maker",
      displayNameKo: "FSM30",
      displayNameVi: "FSM30",
      displayNameEn: "FSM30",
      brandId: seoulAquaBrand.id,
      category: "OTHER",
      categoryId: categoriesByCode.get("ICE_MAKER")?.id,
      inspectionEveryMonths: 1,
      warrantyMonths: 12,
      retailPrice: 22_000_000,
      monthlyRentalPrice: 850_000,
      monthlyMaintenancePrice: 250_000,
    },
  });
  const bidetJ830 = await prisma.equipmentModel.upsert({
    where: { modelCode: "SA-J830" },
    update: {
      categoryId: categoriesByCode.get("BIDET")?.id,
      brandId: seoulAquaBrand.id,
    },
    create: {
      modelCode: "SA-J830",
      name: "SA-J830 Smart Bidet",
      displayNameKo: "SA-J830",
      displayNameVi: "SA-J830",
      displayNameEn: "SA-J830",
      brandId: seoulAquaBrand.id,
      category: "BIDET",
      categoryId: categoriesByCode.get("BIDET")?.id,
      inspectionEveryMonths: 6,
      warrantyMonths: 12,
      retailPrice: 14_500_000,
    },
  });

  console.log(`  ✓ equipment models (10)`);

  // ─── Consumables ─────────────────────────────────────────────────────
  // RO membrane carries BOTH cycles (clean every 6mo, replace every 24mo)
  // to exercise the dual-cycle code path. Pre-Carbon and Sediment are
  // shared by both PTS-2100 and PTS-3500 (N:N compatibility).
  type ConsumableSeed = {
    sku: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
    replaceEveryMonths: number | null;
    cleanEveryMonths: number | null;
    cleanOnEveryVisit?: boolean;
    retailPrice: number;
    compatibleModels: { modelId: string; quantity: number }[];
  };
  const purifierModelIds = [purifier.id, purifierPro.id];
  const allPurifierIds = [purifier.id, purifierPro.id, purifierRoTop.id, purifierRoChp.id];
  function withQty(ids: string[], quantity = 1) {
    return ids.map((modelId) => ({ modelId, quantity }));
  }
  const consumableSeed: ConsumableSeed[] = [
    {
      sku: "FLT-SED-001",
      nameKo: "세디먼트 필터",
      nameVi: "Lõi lọc thô (Sediment)",
      nameEn: "Sediment filter",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModels: withQty(purifierModelIds),
    },
    {
      sku: "FLT-PRE-001",
      nameKo: "프리카본 필터",
      nameVi: "Lõi lọc tiền carbon (Pre-Carbon)",
      nameEn: "Pre-Carbon filter",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 220_000,
      compatibleModels: withQty(purifierModelIds),
    },
    {
      sku: "FLT-RO-001",
      nameKo: "RO 멤브레인",
      nameVi: "Màng RO",
      nameEn: "RO Membrane",
      replaceEveryMonths: 24,
      cleanEveryMonths: 6,
      retailPrice: 650_000,
      compatibleModels: withQty(purifierModelIds),
    },
    {
      sku: "FLT-POST-001",
      nameKo: "포스트카본 필터",
      nameVi: "Lõi lọc hậu carbon (Post-Carbon)",
      nameEn: "Post-Carbon filter",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 240_000,
      compatibleModels: withQty(purifierModelIds),
    },
    {
      sku: "FLT-BIDET-001",
      nameKo: "비데 워터필터",
      nameVi: "Lõi lọc nước bồn cầu",
      nameEn: "Bidet water filter",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 280_000,
      compatibleModels: withQty([bidet.id, bidetJ830.id]),
    },
    {
      sku: "FLT-HEPA-001",
      nameKo: "HEPA 필터",
      nameVi: "Lõi HEPA",
      nameEn: "HEPA filter",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 420_000,
      compatibleModels: withQty([air.id, airCa5000.id]),
    },
    {
      sku: "FLT-CARB-001",
      nameKo: "카본 필터(공기청정기)",
      nameVi: "Lõi carbon (lọc khí)",
      nameEn: "Carbon filter (air)",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModels: withQty([air.id, airCa5000.id]),
    },
    {
      sku: "FLT-AIR-PREFILTER",
      nameKo: "공기청정기 프리필터",
      nameVi: "Lõi lọc thô máy lọc khí",
      nameEn: "Air pre-filter",
      replaceEveryMonths: null,
      cleanEveryMonths: 2,
      retailPrice: 90_000,
      compatibleModels: withQty([air.id, airCa5000.id]),
    },
    // PDF A.4 — water-purifier PRE-FILTER cleaned on EVERY periodic visit.
    {
      sku: "FLT-PURIFIER-PREFILTER",
      nameKo: "정수기 PRE-FILTER",
      nameVi: "Lõi PRE-FILTER (lọc nước)",
      nameEn: "PRE-FILTER (water purifier)",
      replaceEveryMonths: null,
      cleanEveryMonths: null,
      cleanOnEveryVisit: true,
      retailPrice: 80_000,
      compatibleModels: withQty(allPurifierIds),
    },
    // Ice-maker JB-S filter, replaced every 6 months.
    {
      sku: "FLT-ICE-JBS",
      nameKo: "JB-S 필터(제빙기)",
      nameVi: "Lõi JB-S (máy làm đá)",
      nameEn: "JB-S filter",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 320_000,
      compatibleModels: withQty([iceFsm30.id]),
    },
    // Ice-maker UV lamp, 12-month replacement.
    {
      sku: "FLT-ICE-UVLAMP",
      nameKo: "UV 램프(제빙기)",
      nameVi: "Đèn UV (máy làm đá)",
      nameEn: "UV lamp (ice maker)",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 540_000,
      compatibleModels: withQty([iceFsm30.id]),
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
      await prisma.consumableOnModel.create({
        data: { consumableId: row.id, modelId: m.modelId, quantity: m.quantity },
      });
    }
  }
  console.log(`  ✓ consumables (${consumableSeed.length})`);

  // ─── Accessories ─────────────────────────────────────────────────────
  // PDF C.2 — minor parts (cocks, valves, hoses, fittings) stay free for
  // MAINTENANCE customers; major parts (compressor, hot-water tank, PCB)
  // are billed. Seeded mix demonstrates both branches of the default rule.
  type AccessorySeed = {
    sku: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
    retailPrice: number;
    isMinorPart: boolean;
    compatibleModels: { modelId: string; quantity: number }[];
  };
  const accessorySeed: AccessorySeed[] = [
    {
      sku: "ACC-MOUNT-001",
      nameKo: "벽걸이 거치대",
      nameVi: "Giá treo tường",
      nameEn: "Wall mount",
      retailPrice: 120_000,
      isMinorPart: true,
      compatibleModels: withQty(purifierModelIds),
    },
    {
      sku: "ACC-ADAPTER-001",
      nameKo: "전원 어댑터",
      nameVi: "Bộ chuyển nguồn",
      nameEn: "Power adapter",
      retailPrice: 90_000,
      isMinorPart: true,
      compatibleModels: withQty([...purifierModelIds, bidet.id, air.id]),
    },
    {
      sku: "ACC-HOSE-001",
      nameKo: "급수 호스 (3m)",
      nameVi: "Ống cấp nước (3m)",
      nameEn: "Inlet hose (3m)",
      retailPrice: 60_000,
      isMinorPart: true,
      compatibleModels: withQty([...purifierModelIds, bidet.id]),
    },
    // PDF "정수기 부속품" — common (all-purifier) small parts.
    {
      sku: "ACC-SHUTOFF-VALVE",
      nameKo: "아답터 (Water shut-off valve)",
      nameVi: "Van khóa nước",
      nameEn: "Water shut-off valve",
      retailPrice: 45_000,
      isMinorPart: true,
      compatibleModels: withQty(allPurifierIds),
    },
    {
      sku: "ACC-FITTING-L14",
      nameKo: "L 피팅 1/4\"",
      nameVi: "Co nối 90 (1/4\")",
      nameEn: "L fitting 1/4\"",
      retailPrice: 18_000,
      isMinorPart: true,
      compatibleModels: withQty(allPurifierIds),
    },
    {
      sku: "ACC-FITTING-T14",
      nameKo: "T 피팅 1/4\"",
      nameVi: "Co nối chữ T (1/4\")",
      nameEn: "T fitting 1/4\"",
      retailPrice: 22_000,
      isMinorPart: true,
      compatibleModels: withQty(allPurifierIds),
    },
    {
      sku: "ACC-FUSE-001",
      nameKo: "퓨즈 (Fuse)",
      nameVi: "Cầu chì",
      nameEn: "Fuse",
      retailPrice: 12_000,
      isMinorPart: true,
      compatibleModels: withQty(allPurifierIds),
    },
    {
      sku: "ACC-FLOAT-VALVE",
      nameKo: "볼탑 (Floating Valve)",
      nameVi: "Van phao",
      nameEn: "Floating valve",
      retailPrice: 95_000,
      isMinorPart: true,
      compatibleModels: withQty(allPurifierIds),
    },
    {
      sku: "ACC-COLD-TAP",
      nameKo: "냉수코크",
      nameVi: "Vòi nước lạnh",
      nameEn: "Cold water tap",
      retailPrice: 220_000,
      isMinorPart: true,
      compatibleModels: withQty(allPurifierIds),
    },
    {
      sku: "ACC-HOT-TAP",
      nameKo: "온수코크",
      nameVi: "Vòi nước nóng",
      nameEn: "Hot water tap",
      retailPrice: 250_000,
      isMinorPart: true,
      compatibleModels: withQty(allPurifierIds),
    },
    // PDF — major (billable for MAINTENANCE) parts.
    {
      sku: "ACC-COMPRESSOR",
      nameKo: "콤프레샤",
      nameVi: "Block làm lạnh",
      nameEn: "Compressor",
      retailPrice: 3_800_000,
      isMinorPart: false,
      compatibleModels: withQty(allPurifierIds),
    },
    {
      sku: "ACC-HOT-TANK-3L",
      nameKo: "3L 온수탱크 (PTS-2100)",
      nameVi: "Bình nóng 3L (PTS-2100)",
      nameEn: "3L Hot water tank (PTS-2100)",
      retailPrice: 1_450_000,
      isMinorPart: false,
      compatibleModels: withQty([purifier.id]),
    },
    {
      sku: "ACC-PCB-CLOCK",
      nameKo: "PCB clock (PTS-4000T)",
      nameVi: "Mạch điện đồng hồ (PTS-4000T)",
      nameEn: "PCB clock (PTS-4000T)",
      retailPrice: 1_200_000,
      isMinorPart: false,
      compatibleModels: withQty([purifierRoTop.id]),
    },
    {
      sku: "ACC-COLD-TC",
      nameKo: "COLD TC (냉수 센서)",
      nameVi: "Cảm biến lạnh",
      nameEn: "COLD TC sensor",
      retailPrice: 380_000,
      isMinorPart: false,
      compatibleModels: withQty(allPurifierIds),
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
      await prisma.accessoryOnModel.create({
        data: { accessoryId: row.id, modelId: m.modelId, quantity: m.quantity },
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
  const srSeed = [
    { code: "SR-00001", customerId: b2c.id, contactId: b2cPrimaryContact.id, equipmentId: b2c.equipment[0].id, type: "INSPECTION" as const, isPaid: false, state: "PENDING_REVIEW" as const, desc: "Nước chảy yếu, nhờ kiểm tra giúp." },
    { code: "SR-00002", customerId: b2c.id, contactId: b2cPrimaryContact.id, equipmentId: b2c.equipment[0].id, type: "REPAIR" as const, isPaid: true, state: "APPROVED" as const, desc: "Máy kêu to khi lọc nước.", price: 350_000 },
    { code: "SR-00003", customerId: b2cCustomers["KH00004"].id, type: "PART_REPLACEMENT" as const, isPaid: true, state: "REJECTED" as const, desc: "Thay lõi lọc sớm hơn lịch.", reject: "Lõi lọc vẫn trong hạn, chưa cần thay." },
    { code: "SR-00004", customerId: b2cCustomers["KH00006"].id, type: "RELOCATION" as const, isPaid: true, state: "SCHEDULED" as const, desc: "Chuyển máy sang phòng bếp mới.", price: 200_000 },
    { code: "SR-00005", customerId: b2c2.id, equipmentId: b2c2.equipment[0].id, type: "INSPECTION" as const, isPaid: false, state: "COMPLETED" as const, desc: "Định kỳ kiểm tra bồn cầu thông minh." },
  ];
  const serviceRequests: Record<string, { id: string }> = {};
  for (const sr of srSeed) {
    const created = await prisma.serviceRequest.upsert({
      where: { code: sr.code },
      update: {},
      create: {
        code: sr.code,
        customerId: sr.customerId,
        contactId: "contactId" in sr ? sr.contactId : undefined,
        equipmentId: "equipmentId" in sr ? sr.equipmentId : undefined,
        type: sr.type,
        isPaid: sr.isPaid,
        state: sr.state,
        description: sr.desc,
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

  // Past completed periodic inspection (KH00001).
  const vCompleted = await ensureVisit("seed-visit-001", {
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
  const bulkVisitPool: Array<{ customerId: string; equipmentId?: string }> = [
    { customerId: b2cCustomers["KH00004"].id },
    { customerId: b2cCustomers["KH00005"].id },
    { customerId: b2cCustomers["KH00006"].id },
    { customerId: b2cCustomers["KH00007"].id },
    { customerId: b2cCustomers["KH00008"].id },
    { customerId: b2cCustomers["KH00009"].id },
    { customerId: b2cCustomers["KH00010"].id },
    { customerId: b2bCustomers["KH00011"].id },
    { customerId: b2bCustomers["KH00012"].id },
    { customerId: b2bCustomers["KH00013"].id },
    { customerId: b2bCustomers["KH00014"].id },
  ];
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

  console.log(`  ✓ visits (6 anchor + ${bulkVisitCounter} bulk = ${6 + bulkVisitCounter} total across all VisitState values)`);

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
  console.log("\nPortal credentials (KH00001 CONTRACT_PARTY):");
  console.log("  phone 0901234567 / pw portal1234 (mustChangePassword=true)");
  console.log("\nData volume: 14 customers, 24 contracts, 5 service requests, 56 visits, 10 payments.");
}

main()
  .then(() => prisma.$disconnect().then(() => pool.end()))
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
