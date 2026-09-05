/**
 * Integration test for Task 1.4: POST /api/equipment/register
 * (multi-line install wizard extensions — per-line salePrice/installFee,
 * serviceConfig filters, manual contractNumber, deposit-excluded
 * aggregation).
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

import { POST as registerPost } from "@/app/api/equipment/register/route";

const ADMIN_USERNAME = "test_task14_admin";
const ADMIN_PHONE = "9322214001";
const MODEL_CODE = "TEST-TASK14-MODEL";
const CONSUMABLE_SKU = "TEST-TASK14-FILTER";
const CUSTOMER_NAME_PREFIX = "TEST_TASK14_";
const CUSTOMER_CODE_PREFIX = "TESTKH14-";

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

  const pw = await hashPassword("Task14-Test-123!");
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
      nameKo: "Task 1.4 test model",
      nameVi: "Task 1.4 test model",
      nameEn: "Task 1.4 test model",
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

describe("POST /api/equipment/register — multi-line wizard", () => {
  it("(a) RENTAL + SALE lines → equipment per line correct, 1 contract (type=RENTAL, deposit excluded from value)", async () => {
    const customer = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}Mixed` });
    const installedAt = new Date().toISOString();
    const res = await registerPost(
      await buildReq("/api/equipment/register", "POST", adminToken, {
        customerId: customer.id,
        defaultInstalledAt: installedAt,
        createContract: true,
        contractTermMonths: 36,
        lines: [
          {
            modelId,
            serviceType: "RENTAL",
            managementType: "FULL_SERVICE",
            quantity: 2,
            deposit: 500_000,
            monthlyFee: 200_000,
            installedAt,
          },
          {
            modelId,
            serviceType: "SALE",
            managementType: "SELF_MANAGED",
            quantity: 1,
            salePrice: 3_000_000,
            installFee: 100_000,
            installedAt,
          },
        ],
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const data = body.data as {
      equipmentIds: string[];
      visitIds: string[];
      contractId: string;
      contractNumber: string;
    };
    expect(data.equipmentIds).toHaveLength(3);
    expect(data.visitIds).toHaveLength(3);

    const equipment = await prisma.equipment.findMany({
      where: { id: { in: data.equipmentIds } },
      orderBy: { installedAt: "asc" },
    });
    const rentalUnits = equipment.filter((e) => e.serviceType === "RENTAL");
    const saleUnits = equipment.filter((e) => e.serviceType === "SALE");
    expect(rentalUnits).toHaveLength(2);
    expect(saleUnits).toHaveLength(1);
    for (const u of rentalUnits) {
      expect(Number(u.deposit)).toBe(500_000);
      expect(Number(u.monthlyFee)).toBe(200_000);
      expect(u.salePrice).toBeNull();
    }
    for (const u of saleUnits) {
      expect(Number(u.salePrice)).toBe(3_000_000);
      expect(Number(u.installFee)).toBe(100_000);
      expect(u.monthlyFee).toBeNull();
      expect(u.deposit).toBeNull();
    }

    const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
    expect(contract?.type).toBe("RENTAL");
    // Deposit tracked separately, excluded from totalContractValue.
    expect(Number(contract?.deposit)).toBe(500_000 * 2);
    expect(Number(contract?.totalContractValue)).toBe(200_000 * 2 * 36);
    expect(Number(contract?.monthlyMaintenanceFee)).toBe(200_000 * 2);

    const linkCount = await prisma.contractEquipment.count({ where: { contractId: data.contractId } });
    expect(linkCount).toBe(3);
  });

  it("(b) serviceConfig filters on a line → EquipmentConsumable rows created per unit", async () => {
    const customer = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}Filters` });
    const installedAt = new Date().toISOString();
    const res = await registerPost(
      await buildReq("/api/equipment/register", "POST", adminToken, {
        customerId: customer.id,
        defaultInstalledAt: installedAt,
        lines: [
          {
            modelId,
            serviceType: "RENTAL",
            managementType: "FULL_SERVICE",
            quantity: 1,
            deposit: 300_000,
            monthlyFee: 150_000,
            installedAt,
            serviceConfig: {
              inspectionCycleDays: 90,
              filters: [
                { consumableId, quantity: 1, useCycleDays: 180 },
                { customName: "Custom Off-catalog Filter", quantity: 2, useCycleDays: 90 },
              ],
            },
          },
        ],
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
    expect(byCatalog?.quantity).toBe(1);

    const byCustom = rows.find((r) => r.customName === "Custom Off-catalog Filter");
    expect(byCustom?.replaceEveryDays).toBe(90);
    expect(byCustom?.quantity).toBe(2);

    const equipment = await prisma.equipment.findUnique({ where: { id: data.equipmentIds[0] } });
    expect(equipment?.customInspectionCycleDays).toBe(90);
  });

  it("(c) manual contractNumber duplicate → 400 (no auto-suffix fallback)", async () => {
    const customerA = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}DupA` });
    const customerB = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}DupB` });
    const installedAt = new Date().toISOString();
    const manualNumber = `HD-TEST14-DUP-${Date.now()}`;

    const buildBody = (customerId: string) => ({
      customerId,
      defaultInstalledAt: installedAt,
      createContract: true,
      contractTermMonths: 12,
      contractNumber: manualNumber,
      lines: [
        {
          modelId,
          serviceType: "MAINTENANCE",
          managementType: "FULL_SERVICE",
          quantity: 1,
          monthlyFee: 60_000,
          installedAt,
        },
      ],
    });

    const first = await registerPost(
      await buildReq("/api/equipment/register", "POST", adminToken, buildBody(customerA.id)),
    );
    expect((await readJson(first)).status).toBe(201);

    const second = await registerPost(
      await buildReq("/api/equipment/register", "POST", adminToken, buildBody(customerB.id)),
    );
    const { status, body } = await readJson(second);
    expect(status).toBe(400);
    expect(body.error?.message).toMatch(/already exists/i);

    // Rolled back — no leftover equipment/visit from the failed second attempt.
    const leftoverEquipment = await prisma.equipment.count({ where: { customerId: customerB.id } });
    expect(leftoverEquipment).toBe(0);
  });

  it("(d) 장비코드 is globally sequenced — two customers, same model, same day never collide", async () => {
    const customerA = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}CodeA` });
    const customerB = await createCustomer({ name: `${CUSTOMER_NAME_PREFIX}CodeB` });
    const installedAt = new Date().toISOString();
    const prefix = `${MODEL_CODE}${formatVstDateStamp(new Date(installedAt)).slice(2)}`;

    const register = async (customerId: string, quantity: number) => {
      const res = await registerPost(
        await buildReq("/api/equipment/register", "POST", adminToken, {
          customerId,
          defaultInstalledAt: installedAt,
          createContract: false,
          lines: [
            {
              modelId,
              serviceType: "SALE",
              managementType: "SELF_MANAGED",
              quantity,
              salePrice: 1_000_000,
              installedAt,
            },
          ],
        }),
      );
      const { status, body } = await readJson(res);
      expect(status).toBe(201);
      const ids = (body.data as { equipmentIds: string[] }).equipmentIds;
      const rows = await prisma.equipment.findMany({
        where: { id: { in: ids } },
        select: { assetCode: true },
      });
      return rows.map((r) => r.assetCode!);
    };

    const before = await prisma.equipment.count({
      where: { assetCode: { startsWith: prefix } },
    });
    const codesA = await register(customerA.id, 2);
    const codesB = await register(customerB.id, 2);

    // Every code carries the {modelCode}{YYMMDD} prefix …
    for (const code of [...codesA, ...codesB]) {
      expect(code.startsWith(prefix)).toBe(true);
    }
    // … the sequence ignores the customer boundary and just keeps counting …
    const seq = [...codesA, ...codesB]
      .map((c) => Number(c.slice(prefix.length)))
      .sort((x, y) => x - y);
    expect(seq).toEqual([before + 1, before + 2, before + 3, before + 4]);
    // … and no two units share a code.
    expect(new Set([...codesA, ...codesB]).size).toBe(4);
  });
});
