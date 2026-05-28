// Seed data for local development.
// Per CLAUDE.md: db:reset deletes everything and re-seeds — never on prod.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
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
  const manager = await prisma.user.upsert({
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
  const tech1 = await prisma.user.upsert({
    where: { phone: "0123456783" },
    update: { username: "tech1", passwordHash: devPw, role: "TECHNICIAN" },
    create: {
      username: "tech1",
      phone: "0123456783",
      passwordHash: devPw,
      role: "TECHNICIAN",
      preferredRegion: "HCMC-D1",
    },
  });
  const tech2 = await prisma.user.upsert({
    where: { phone: "0123456784" },
    update: { username: "tech2", passwordHash: devPw, role: "TECHNICIAN" },
    create: {
      username: "tech2",
      phone: "0123456784",
      passwordHash: devPw,
      role: "TECHNICIAN",
      preferredRegion: "HCMC-D7",
    },
  });

  console.log(`  ✓ users (${[admin, manager, staff, tech1, tech2].length})`);

  // ─── Equipment models ───────────────────────────────────────────────
  const purifier = await prisma.equipmentModel.upsert({
    where: { modelCode: "PTS-2100" },
    update: {},
    create: {
      modelCode: "PTS-2100",
      name: "PTS-2100 Water Purifier",
      category: "WATER_PURIFIER",
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
  const bidet = await prisma.equipmentModel.upsert({
    where: { modelCode: "SA-J430" },
    update: {},
    create: {
      modelCode: "SA-J430",
      name: "SA-J430 Smart Bidet",
      category: "BIDET",
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
    update: {},
    create: {
      modelCode: "AC-700",
      name: "AC-700 Air Purifier",
      category: "AIR_PURIFIER",
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

  console.log(`  ✓ equipment models (3)`);

  // ─── B2C customer ───────────────────────────────────────────────────
  // Portal smoke account: KH00001's CONTRACT_PARTY has portalEnabled + a known
  // dev password "portal1234" + mustChangePassword=true so the first-login
  // force-change flow can be exercised end-to-end.
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

  // Equipment per site
  await prisma.equipment.create({
    data: {
      customerId: b2b.id,
      siteId: hcmcSite.id,
      modelId: purifier.id,
      serialNumber: "PTS-2100-000010",
      installedAt: new Date("2025-08-01"),
      status: "ACTIVE",
      ownership: "COMPANY",
    },
  });
  await prisma.equipment.create({
    data: {
      customerId: b2b.id,
      siteId: hcmcSite.id,
      modelId: air.id,
      serialNumber: "AC-700-000005",
      installedAt: new Date("2025-08-01"),
      status: "ACTIVE",
      ownership: "COMPANY",
    },
  });
  await prisma.equipment.create({
    data: {
      customerId: b2b.id,
      siteId: hnSite.id,
      modelId: purifier.id,
      serialNumber: "PTS-2100-000011",
      installedAt: new Date("2025-09-01"),
      status: "ACTIVE",
      ownership: "COMPANY",
    },
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
  });

  console.log(`  ✓ B2C customer ${b2c2.code} (Korean speaker)`);

  console.log("\nDone seeding.");
  console.log("\nLogin credentials (dev only) — phone is the login key:");
  console.log("  admin    phone 012345678   / pw 12341234");
  console.log("  manager  phone 0123456781  / pw 12341234");
  console.log("  staff    phone 0123456782  / pw 12341234");
  console.log("  tech1    phone 0123456783  / pw 12341234");
  console.log("  tech2    phone 0123456784  / pw 12341234");
  console.log("\nPortal credentials (KH00001 CONTRACT_PARTY):");
  console.log("  phone 0901234567 / pw portal1234 (mustChangePassword=true)");
}

main()
  .then(() => prisma.$disconnect().then(() => pool.end()))
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
