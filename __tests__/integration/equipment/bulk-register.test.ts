/**
 * Integration test for Task 1.3: POST /api/equipment/bulk-register
 * (4-step wizard extensions — pricing, manual contract number, SALE +
 * FULL_SERVICE dual-contract split, serviceConfig filters).
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { formatVstDateStamp } from "@/lib/contracts/code";

import { POST as bulkRegisterPost } from "@/app/api/equipment/bulk-register/route";

const ADMIN_USERNAME = "test_task13_admin";
const ADMIN_PHONE = "9322213001";
const MODEL_CODE = "TEST-TASK13-MODEL";
const CONSUMABLE_SKU = "TEST-TASK13-FILTER";
const CUSTOMER_NAME_PREFIX = "TEST_TASK13_";
const CUSTOMER_CODE_PREFIX = "TESTKH13-";

let adminToken = "";
let modelId = "";
let consumableId = "";

async function buildReq(url: string, method: string, token: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function readJson(res: Response) {
  const status = res.status;
  const body = (await res.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  return { status, body };
}

async function cleanup() {
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { startsWith: CUSTOMER_NAME_PREFIX } },
        { code: { startsWith: CUSTOMER_CODE_PREFIX } },
      ],
    },
    select: { id: true },
  });
  for (const c of customers) {
    const contractIds = (
      await prisma.contract.findMany({ where: { customerId: c.id }, select: { id: true } })
    ).map((r) => r.id);
    const equipmentRows = await prisma.equipment.findMany({
      where: { customerId: c.id },
      select: { id: true },
    });
    const equipmentIds = equipmentRows.map((e) => e.id);
    await prisma.equipmentConsumable.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
    await prisma.visit.deleteMany({ where: { customerId: c.id } });
    await prisma.contractEquipment.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.contract.deleteMany({ where: { customerId: c.id } });
    await prisma.equipment.deleteMany({ where: { customerId: c.id } });
    await prisma.customerContact.deleteMany({ where: { customerId: c.id } });
    await prisma.customer.delete({ where: { id: c.id } });
  }
  await prisma.consumableOnModel.deleteMany({ where: { model: { modelCode: MODEL_CODE } } });
  await prisma.consumable.deleteMany({ where: { sku: CONSUMABLE_SKU } });
  await prisma.equipmentModel.deleteMany({ where: { modelCode: MODEL_CODE } });
  const user = await prisma.user.findUnique({ where: { phone: ADMIN_PHONE }, select: { id: true } });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";

  await cleanup();

  const pw = await hashPassword("Task13-Test-123!");
  const admin = await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      phone: ADMIN_PHONE,
      email: `${ADMIN_USERNAME}@t.local`,
      passwordHash: pw,
      role: "ADMIN",
    },
  });
  adminToken = await signStaffAccessToken({ userId: admin.id, username: admin.username, role: admin.role });

  const model = await prisma.equipmentModel.create({
    data: {
      modelCode: MODEL_CODE,
      nameKo: "Task 1.3 test model",
      nameVi: "Task 1.3 test model",
      nameEn: "Task 1.3 test model",
      category: "WATER_PURIFIER",
    },
  });
  modelId = model.id;

  const consumable = await prisma.consumable.create({
    data: {
      sku: CONSUMABLE_SKU,
      nameKo: "테스트 필터",
      nameVi: "Lõi lọc test",
      nameEn: "Test filter",
      replaceEveryDays: 180,
      retailPrice: 50_000,
    },
  });
  consumableId = consumable.id;
});

afterAll(async () => {
  await cleanup();
});

async function createCustomer(opts: { name: string; type?: "B2C" | "B2B" }) {
  return prisma.customer.create({
    data: {
      code: `${CUSTOMER_CODE_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: opts.name,
      type: opts.type ?? "B2C",
      contacts: {
        create: [
          {
            role: "CONTRACT_PARTY",
            scope: "CUSTOMER",
            isPrimary: false,
            name: "Test CP",
            phone1: `0900${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
            email: "cp@example.com",
            language: "vi",
          },
        ],
      },
    },
  });
}

describe("POST /api/equipment/bulk-register — 4-step wizard", () => {
  it("(a) RENTAL: N units → N equipment + N visits + 1 contract (deposit=Σ, totalValue=Σrent×term)", async () => {
    const customer = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}Rental` });
    const installedAt = new Date().toISOString();
    const res = await bulkRegisterPost(
      await buildReq("/api/equipment/bulk-register", "POST", adminToken, {
        customerId: customer.id,
        modelId,
        serviceType: "RENTAL",
        managementType: "FULL_SERVICE",
        deposit: 500_000,
        monthlyRent: 200_000,
        defaultInstalledAt: installedAt,
        createContract: true,
        contractTermMonths: 36,
        rows: [{ installedAt }, { installedAt }, { installedAt }],
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const data = body.data as {
      equipmentIds: string[];
      visitIds: string[];
      contractId: string;
      contractIds: string[];
    };
    expect(data.equipmentIds).toHaveLength(3);
    expect(data.visitIds).toHaveLength(3);
    expect(data.contractIds).toHaveLength(1);

    const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
    expect(contract?.type).toBe("RENTAL");
    expect(Number(contract?.deposit)).toBe(500_000 * 3);
    expect(Number(contract?.totalContractValue)).toBe(200_000 * 3 * 36);
    expect(Number(contract?.monthlyMaintenanceFee)).toBe(200_000 * 3);

    const linkCount = await prisma.contractEquipment.count({ where: { contractId: data.contractId } });
    expect(linkCount).toBe(3);

    // 장비코드 is system-issued: {modelCode}{YYMMDD}{NNNN}, consecutive within
    // the batch and globally unique (no per-customer numbering).
    const stamp = formatVstDateStamp(new Date(installedAt)).slice(2);
    const codes = (
      await prisma.equipment.findMany({
        where: { id: { in: data.equipmentIds } },
        select: { assetCode: true },
        orderBy: { assetCode: "asc" },
      })
    ).map((e) => e.assetCode);
    expect(codes.every((c) => c?.startsWith(`${MODEL_CODE}${stamp}`))).toBe(true);
    expect(new Set(codes).size).toBe(3);
    const seq = codes.map((c) => Number(c!.slice(`${MODEL_CODE}${stamp}`.length)));
    expect(seq[1]).toBe(seq[0] + 1);
    expect(seq[2]).toBe(seq[1] + 1);
  });

  it("(b) SALE self-managed + hasContract=false → 0 contracts, equipment salePrice/installFee set", async () => {
    const customer = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}SaleSelf` });
    const installedAt = new Date().toISOString();
    const res = await bulkRegisterPost(
      await buildReq("/api/equipment/bulk-register", "POST", adminToken, {
        customerId: customer.id,
        modelId,
        serviceType: "SALE",
        managementType: "SELF_MANAGED",
        salePrice: 3_000_000,
        installFee: 100_000,
        hasContract: false,
        defaultInstalledAt: installedAt,
        createContract: true,
        rows: [{ installedAt }],
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const data = body.data as {
      equipmentIds: string[];
      contractId: string | null;
      contractIds: string[];
    };
    expect(data.contractIds).toHaveLength(0);
    expect(data.contractId).toBeNull();

    const equipment = await prisma.equipment.findUnique({ where: { id: data.equipmentIds[0] } });
    expect(Number(equipment?.salePrice)).toBe(3_000_000);
    expect(Number(equipment?.installFee)).toBe(100_000);
    expect(equipment?.monthlyFee).toBeNull();
  });

  it("(c) SALE + hasContract + FULL_SERVICE (유지보수 등록) → 2 contracts (SALE + MAINTENANCE)", async () => {
    const customer = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}SaleFull` });
    const installedAt = new Date().toISOString();
    const res = await bulkRegisterPost(
      await buildReq("/api/equipment/bulk-register", "POST", adminToken, {
        customerId: customer.id,
        modelId,
        serviceType: "SALE",
        managementType: "FULL_SERVICE",
        salePrice: 2_000_000,
        installFee: 50_000,
        monthlyMaintenanceFee: 80_000,
        hasContract: true,
        defaultInstalledAt: installedAt,
        createContract: true,
        rows: [{ installedAt }, { installedAt }],
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const data = body.data as { contractId: string; contractIds: string[] };
    expect(data.contractIds).toHaveLength(2);

    const contracts = await prisma.contract.findMany({ where: { id: { in: data.contractIds } } });
    expect(contracts.map((c) => c.type).sort()).toEqual(["MAINTENANCE", "SALE"]);

    const saleContract = contracts.find((c) => c.type === "SALE");
    expect(saleContract).toBeDefined();
    expect(Number(saleContract?.totalContractValue)).toBe((2_000_000 + 50_000) * 2);
    expect(saleContract?.id).toBe(data.contractId); // primary key stays pointed at the SALE contract

    const maintContract = contracts.find((c) => c.type === "MAINTENANCE");
    expect(maintContract).toBeDefined();
    expect(Number(maintContract?.totalContractValue)).toBe(80_000 * 2);
    expect(Number(maintContract?.monthlyMaintenanceFee)).toBe(80_000 * 2);
    expect(maintContract?.contractNumber).not.toBe(saleContract?.contractNumber);
  });

  it("(d) manual contractNumber duplicate → 400 (no auto-suffix fallback)", async () => {
    const customerA = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}DupA` });
    const customerB = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}DupB` });
    const installedAt = new Date().toISOString();
    const manualNumber = `HD-TEST13-DUP-${Date.now()}`;

    const buildBody = (customerId: string) => ({
      customerId,
      modelId,
      serviceType: "MAINTENANCE",
      managementType: "FULL_SERVICE",
      monthlyMaintenanceFee: 60_000,
      defaultInstalledAt: installedAt,
      createContract: true,
      contractTermMonths: 12,
      contractNumber: manualNumber,
      rows: [{ installedAt }],
    });

    const first = await bulkRegisterPost(
      await buildReq("/api/equipment/bulk-register", "POST", adminToken, buildBody(customerA.id)),
    );
    expect((await readJson(first)).status).toBe(201);

    const second = await bulkRegisterPost(
      await buildReq("/api/equipment/bulk-register", "POST", adminToken, buildBody(customerB.id)),
    );
    const { status, body } = await readJson(second);
    expect(status).toBe(400);
    expect(body.error?.message).toMatch(/already exists/i);

    // Rolled back — no leftover equipment/visit from the failed second attempt.
    const leftoverEquipment = await prisma.equipment.count({ where: { customerId: customerB.id } });
    expect(leftoverEquipment).toBe(0);
  });

  it("(e) serviceConfig filters (consumableId + customName) → both create EquipmentConsumable rows", async () => {
    const customer = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}Filters` });
    const installedAt = new Date().toISOString();
    const res = await bulkRegisterPost(
      await buildReq("/api/equipment/bulk-register", "POST", adminToken, {
        customerId: customer.id,
        modelId,
        serviceType: "RENTAL",
        managementType: "FULL_SERVICE",
        deposit: 300_000,
        monthlyRent: 150_000,
        defaultInstalledAt: installedAt,
        rows: [{ installedAt }],
        serviceConfig: {
          inspectionCycleDays: 90,
          filters: [
            { consumableId, quantity: 1, useCycleDays: 180 },
            { customName: "Custom Off-catalog Filter", quantity: 2, useCycleDays: 90 },
          ],
        },
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const data = body.data as { equipmentIds: string[] };

    const rows = await prisma.equipmentConsumable.findMany({
      where: { equipmentId: data.equipmentIds[0] },
    });
    expect(rows).toHaveLength(2);

    const byCatalog = rows.find((r) => r.consumableId === consumableId);
    expect(byCatalog?.replaceEveryDays).toBe(180);
    expect(byCatalog?.customName).toBeNull();
    expect(byCatalog?.quantity).toBe(1);

    const byCustom = rows.find((r) => r.customName === "Custom Off-catalog Filter");
    expect(byCustom?.replaceEveryDays).toBe(90);
    expect(byCustom?.quantity).toBe(2);
    expect(byCustom?.consumableId).toBeNull();

    const equipment = await prisma.equipment.findUnique({ where: { id: data.equipmentIds[0] } });
    expect(equipment?.customInspectionCycleDays).toBe(90);
  });
});
