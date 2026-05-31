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

  // ─── Product categories (multilingual) ──────────────────────────────
  // Mirror the legacy EquipmentCategory enum during the rollout — both the
  // enum column and the FK get populated so list filters keep working.
  const catSeed = [
    { code: "WATER_PURIFIER", nameKo: "정수기", nameVi: "Máy lọc nước", nameEn: "Water purifier", sortOrder: 10 },
    { code: "BIDET", nameKo: "비데", nameVi: "Bồn cầu thông minh", nameEn: "Bidet", sortOrder: 20 },
    { code: "AIR_PURIFIER", nameKo: "공기청정기", nameVi: "Máy lọc không khí", nameEn: "Air purifier", sortOrder: 30 },
    { code: "FILTER", nameKo: "필터/소모품", nameVi: "Lõi lọc / Vật tư tiêu hao", nameEn: "Filter / Consumable", sortOrder: 40 },
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
    update: { categoryId: categoriesByCode.get("WATER_PURIFIER")?.id },
    create: {
      modelCode: "PTS-2100",
      name: "PTS-2100 Water Purifier",
      category: "WATER_PURIFIER",
      categoryId: categoriesByCode.get("WATER_PURIFIER")?.id,
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
    update: { categoryId: categoriesByCode.get("WATER_PURIFIER")?.id },
    create: {
      modelCode: "PTS-3500",
      name: "PTS-3500 Hot/Cold Water Purifier",
      category: "WATER_PURIFIER",
      categoryId: categoriesByCode.get("WATER_PURIFIER")?.id,
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
    update: { categoryId: categoriesByCode.get("BIDET")?.id },
    create: {
      modelCode: "SA-J430",
      name: "SA-J430 Smart Bidet",
      category: "BIDET",
      categoryId: categoriesByCode.get("BIDET")?.id,
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
    update: { categoryId: categoriesByCode.get("AIR_PURIFIER")?.id },
    create: {
      modelCode: "AC-700",
      name: "AC-700 Air Purifier",
      category: "AIR_PURIFIER",
      categoryId: categoriesByCode.get("AIR_PURIFIER")?.id,
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

  console.log(`  ✓ equipment models (4)`);

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
    retailPrice: number;
    compatibleModelIds: string[];
  };
  const purifierModelIds = [purifier.id, purifierPro.id];
  const consumableSeed: ConsumableSeed[] = [
    {
      sku: "FLT-SED-001",
      nameKo: "세디먼트 필터",
      nameVi: "Lõi lọc thô (Sediment)",
      nameEn: "Sediment filter",
      replaceEveryMonths: 3,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModelIds: purifierModelIds,
    },
    {
      sku: "FLT-PRE-001",
      nameKo: "프리카본 필터",
      nameVi: "Lõi lọc tiền carbon (Pre-Carbon)",
      nameEn: "Pre-Carbon filter",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 220_000,
      compatibleModelIds: purifierModelIds,
    },
    {
      sku: "FLT-RO-001",
      nameKo: "RO 멤브레인",
      nameVi: "Màng RO",
      nameEn: "RO Membrane",
      replaceEveryMonths: 24,
      cleanEveryMonths: 6,
      retailPrice: 650_000,
      compatibleModelIds: purifierModelIds,
    },
    {
      sku: "FLT-POST-001",
      nameKo: "포스트카본 필터",
      nameVi: "Lõi lọc hậu carbon (Post-Carbon)",
      nameEn: "Post-Carbon filter",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 240_000,
      compatibleModelIds: purifierModelIds,
    },
    {
      sku: "FLT-BIDET-001",
      nameKo: "비데 워터필터",
      nameVi: "Lõi lọc nước bồn cầu",
      nameEn: "Bidet water filter",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 280_000,
      compatibleModelIds: [bidet.id],
    },
    {
      sku: "FLT-HEPA-001",
      nameKo: "HEPA 필터",
      nameVi: "Lõi HEPA",
      nameEn: "HEPA filter",
      replaceEveryMonths: 12,
      cleanEveryMonths: null,
      retailPrice: 420_000,
      compatibleModelIds: [air.id],
    },
    {
      sku: "FLT-CARB-001",
      nameKo: "카본 필터(공기청정기)",
      nameVi: "Lõi carbon (lọc khí)",
      nameEn: "Carbon filter (air)",
      replaceEveryMonths: 6,
      cleanEveryMonths: null,
      retailPrice: 180_000,
      compatibleModelIds: [air.id],
    },
    {
      sku: "FLT-AIR-PREFILTER",
      nameKo: "공기청정기 프리필터",
      nameVi: "Lõi lọc thô máy lọc khí",
      nameEn: "Air pre-filter",
      replaceEveryMonths: null,
      cleanEveryMonths: 2,
      retailPrice: 90_000,
      compatibleModelIds: [air.id],
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
        retailPrice: c.retailPrice,
      },
      create: {
        sku: c.sku,
        nameKo: c.nameKo,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        replaceEveryMonths: c.replaceEveryMonths,
        cleanEveryMonths: c.cleanEveryMonths,
        retailPrice: c.retailPrice,
      },
    });
    // Reset compatibility and rewrite — keeps the join table aligned with
    // the seed declaration (small N, safe to nuke+recreate).
    await prisma.consumableOnModel.deleteMany({ where: { consumableId: row.id } });
    for (const modelId of c.compatibleModelIds) {
      await prisma.consumableOnModel.create({ data: { consumableId: row.id, modelId } });
    }
  }
  console.log(`  ✓ consumables (${consumableSeed.length})`);

  // ─── Accessories ─────────────────────────────────────────────────────
  type AccessorySeed = {
    sku: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
    retailPrice: number;
    compatibleModelIds: string[];
  };
  const accessorySeed: AccessorySeed[] = [
    {
      sku: "ACC-MOUNT-001",
      nameKo: "벽걸이 거치대",
      nameVi: "Giá treo tường",
      nameEn: "Wall mount",
      retailPrice: 120_000,
      compatibleModelIds: purifierModelIds,
    },
    {
      sku: "ACC-ADAPTER-001",
      nameKo: "전원 어댑터",
      nameVi: "Bộ chuyển nguồn",
      nameEn: "Power adapter",
      retailPrice: 90_000,
      compatibleModelIds: [...purifierModelIds, bidet.id, air.id],
    },
    {
      sku: "ACC-HOSE-001",
      nameKo: "급수 호스 (3m)",
      nameVi: "Ống cấp nước (3m)",
      nameEn: "Inlet hose (3m)",
      retailPrice: 60_000,
      compatibleModelIds: [...purifierModelIds, bidet.id],
    },
  ];

  for (const a of accessorySeed) {
    const row = await prisma.accessory.upsert({
      where: { sku: a.sku },
      update: {
        nameKo: a.nameKo,
        nameVi: a.nameVi,
        nameEn: a.nameEn,
        retailPrice: a.retailPrice,
      },
      create: {
        sku: a.sku,
        nameKo: a.nameKo,
        nameVi: a.nameVi,
        nameEn: a.nameEn,
        retailPrice: a.retailPrice,
      },
    });
    await prisma.accessoryOnModel.deleteMany({ where: { accessoryId: row.id } });
    for (const modelId of a.compatibleModelIds) {
      await prisma.accessoryOnModel.create({ data: { accessoryId: row.id, modelId } });
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

  // ─── Bulk B2C customers (KH00004–KH00010) for list/pagination testing ─
  const bulkB2c = [
    { code: "KH00004", name: "Trần Thị Hồng", district: "Quận 3", region: "HCMC-D3", tech: tech3.id, model: bidet, serial: "SA-J430-000020" },
    { code: "KH00005", name: "Võ Văn Tâm", district: "Quận 7", region: "HCMC-D7", tech: tech2.id, model: purifier, serial: "PTS-2100-000030" },
    { code: "KH00006", name: "Đặng Thị Thúy", district: "Quận 1", region: "HCMC-D1", tech: tech1.id, model: air, serial: "AC-700-000020" },
    { code: "KH00007", name: "Bùi Minh Khôi", district: "Quận 3", region: "HCMC-D3", tech: tech3.id, model: purifierPro, serial: "PTS-3500-000001" },
    { code: "KH00008", name: "Hoàng Văn Long", district: "Hoàn Kiếm", region: "HN-HK", tech: tech4.id, model: purifier, serial: "PTS-2100-000031" },
    { code: "KH00009", name: "이지은", district: "Quận 7", region: "HCMC-D7", tech: tech2.id, model: bidet, serial: "SA-J430-000021", lang: "ko" as const },
    { code: "KH00010", name: "Phan Thị Cẩm", district: "Quận 1", region: "HCMC-D1", tech: tech1.id, model: purifier, serial: "PTS-2100-000032" },
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
    { code: "KH00011", name: "CÔNG TY CỔ PHẦN ABC FOODS", shortcode: "ABC", tax: "0301234501", region: "HCMC-D1" },
    { code: "KH00012", name: "CÔNG TY TNHH XYZ LOGISTICS", shortcode: "XYZ", tax: "0301234502", region: "HCMC-D7" },
    { code: "KH00013", name: "NGÂN HÀNG TMCP DELTA", shortcode: "DLT", tax: "0301234503", region: "HN-HK" },
    { code: "KH00014", name: "TRƯỜNG QUỐC TẾ GAMMA", shortcode: "GMA", tax: "0301234504", region: "HCMC-D3" },
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

  console.log(`  ✓ contracts (9: draft/pending/active/amended/completed/terminated)`);

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

  console.log(`  ✓ visits (6: completed/scheduled/suggested/in-progress/no-show)`);

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

  console.log(`  ✓ payments (7: expected/collected/handed-over/reconciled/overdue×3)`);

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
  console.log("\nData volume: 14 customers, 9 contracts, 5 service requests, 6 visits, 7 payments.");
}

main()
  .then(() => prisma.$disconnect().then(() => pool.end()))
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
