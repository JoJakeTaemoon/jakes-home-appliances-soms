/**
 * Integration test for the Phase 3 Contract pipeline.
 *
 * Covers:
 *   - POST /api/contracts (B2C SALE + B2B RENTAL multi-equipment)
 *   - GET /api/contracts (filter by customer + type + state)
 *   - POST /api/contracts/[id]/state (DRAFT → PENDING_SIGNATURE → ACTIVE)
 *   - POST /api/contracts/[id]/amend (B2B Appendix revision++)
 *   - POST /api/contracts/[id]/amend (B2C in-place fee adjust)
 *   - POST /api/contracts/[id]/renew (1-click renewal)
 *   - Equipment-belongs-to-other-customer rejection
 *   - runRentalCompletionCheck flips Equipment.ownership to CUSTOMER
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { GET as contractsGet, POST as contractsPost } from "@/app/api/contracts/route";
import { POST as stateRoute } from "@/app/api/contracts/[id]/state/route";
import { POST as amendRoute } from "@/app/api/contracts/[id]/amend/route";
import { POST as renewRoute } from "@/app/api/contracts/[id]/renew/route";
import { ContractWorkflow } from "@/lib/contracts/workflow";

const ADMIN_USERNAME = "test_phase3_admin";
const MANAGER_USERNAME = "test_phase3_manager";
const STAFF_USERNAME = "test_phase3_staff";
const ADMIN_PHONE = "9322200001";
const MANAGER_PHONE = "9322200002";
const STAFF_PHONE = "9322200003";

let adminToken = "";
let managerToken = "";
let staffToken = "";
let modelId = "";

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
    pagination?: unknown;
  };
  return { status, body };
}

async function cleanup() {
  // Delete all Phase 3 test data. Order matters because of FKs.
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { startsWith: "TEST_PHASE3_" } },
        { code: { startsWith: "TESTKH3-" } },
      ],
    },
    select: { id: true },
  });
  for (const c of customers) {
    const contractIds = (await prisma.contract.findMany({ where: { customerId: c.id }, select: { id: true } })).map(
      (r) => r.id,
    );
    await prisma.notificationLog.deleteMany({ where: { customerId: c.id } });
    await prisma.document.deleteMany({ where: { customerId: c.id } });
    await prisma.contractEquipment.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.contract.deleteMany({ where: { customerId: c.id } });
    await prisma.equipment.deleteMany({ where: { customerId: c.id } });
    await prisma.customerContact.deleteMany({ where: { customerId: c.id } });
    await prisma.site.deleteMany({ where: { customerId: c.id } });
    await prisma.customer.delete({ where: { id: c.id } });
  }
  await prisma.equipmentModel.deleteMany({ where: { modelCode: "TEST-PHASE3-MODEL" } });
  for (const phone of [ADMIN_PHONE, MANAGER_PHONE, STAFF_PHONE]) {
    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";

  await cleanup();

  const pw = await hashPassword("Phase3-Test-123!");
  const admin = await prisma.user.create({ data: { username: ADMIN_USERNAME, phone: ADMIN_PHONE, email: `${ADMIN_USERNAME}@t.local`, passwordHash: pw, role: "ADMIN" } });
  const manager = await prisma.user.create({ data: { username: MANAGER_USERNAME, phone: MANAGER_PHONE, email: `${MANAGER_USERNAME}@t.local`, passwordHash: pw, role: "MANAGER" } });
  const staff = await prisma.user.create({ data: { username: STAFF_USERNAME, phone: STAFF_PHONE, email: `${STAFF_USERNAME}@t.local`, passwordHash: pw, role: "STAFF" } });
  adminToken = await signStaffAccessToken({ userId: admin.id, username: admin.username, role: admin.role });
  managerToken = await signStaffAccessToken({ userId: manager.id, username: manager.username, role: manager.role });
  staffToken = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });

  const model = await prisma.equipmentModel.upsert({
    where: { modelCode: "TEST-PHASE3-MODEL" },
    update: {},
    create: { modelCode: "TEST-PHASE3-MODEL", name: "Phase 3 test model", category: "WATER_PURIFIER" },
  });
  modelId = model.id;
});

afterAll(async () => {
  await cleanup();
});

async function createCustomerWithEquipment(opts: {
  type: "B2C" | "B2B";
  shortcode?: string;
  name: string;
  taxCode?: string;
}) {
  const customer = await prisma.customer.create({
    data: {
      code: `TESTKH3-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: opts.name,
      type: opts.type,
      shortcode: opts.type === "B2B" ? opts.shortcode ?? null : null,
      taxCode: opts.type === "B2B" ? opts.taxCode ?? null : null,
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
  const equipment = await prisma.equipment.create({
    data: {
      customerId: customer.id,
      modelId,
      serialNumber: `SN-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      ownership: "COMPANY",
      status: "ACTIVE",
    },
  });
  return { customer, equipment };
}

describe("POST /api/contracts (B2C SALE)", () => {
  it("creates a DRAFT contract with the right code", async () => {
    const { customer, equipment } = await createCustomerWithEquipment({ type: "B2C", name: "TEST_PHASE3_B2C_Sale" });
    const res = await contractsPost(
      await buildReq("/api/contracts", "POST", adminToken, {
        type: "SALE",
        customerId: customer.id,
        equipment: [{ equipmentId: equipment.id, unitPrice: 5_000_000, quantity: 1 }],
        totalContractValue: 5_000_000,
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const created = body.data as { id: string; contractNumber: string; state: string };
    expect(created.state).toBe("DRAFT");
    expect(created.contractNumber).toMatch(/^HD-\d{8}\/SA-TESTKH3-/);
  });

  it("rejects equipment belonging to a different customer", async () => {
    const a = await createCustomerWithEquipment({ type: "B2C", name: "TEST_PHASE3_B2C_OtherA" });
    const b = await createCustomerWithEquipment({ type: "B2C", name: "TEST_PHASE3_B2C_OtherB" });
    const res = await contractsPost(
      await buildReq("/api/contracts", "POST", adminToken, {
        type: "SALE",
        customerId: a.customer.id,
        equipment: [{ equipmentId: b.equipment.id, unitPrice: 1, quantity: 1 }],
        totalContractValue: 1,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("Full lifecycle — DRAFT → PENDING_SIGNATURE → ACTIVE → AMEND → RENEW", () => {
  it("B2B contract reaches ACTIVE then amends with a new revision row", async () => {
    const { customer, equipment } = await createCustomerWithEquipment({
      type: "B2B",
      name: "TEST_PHASE3_B2B_Lifecycle",
      shortcode: "TP3",
      taxCode: "0399000111",
    });
    const create = await contractsPost(
      await buildReq("/api/contracts", "POST", adminToken, {
        type: "RENTAL",
        customerId: customer.id,
        equipment: [{ equipmentId: equipment.id, unitPrice: 200_000, quantity: 1 }],
        monthlyMaintenanceFee: 200_000,
        termMonths: 36,
      }),
    );
    const { body: cBody } = await readJson(create);
    const contract = cBody.data as { id: string; contractNumber: string };

    // STAFF can move DRAFT → PENDING_SIGNATURE.
    const toPending = await stateRoute(
      await buildReq(`/api/contracts/${contract.id}/state`, "POST", staffToken, { to: "PENDING_SIGNATURE" }),
      { params: Promise.resolve({ id: contract.id }) },
    );
    expect(toPending.status).toBe(200);

    // STAFF cannot move to ACTIVE.
    const toActiveStaff = await stateRoute(
      await buildReq(`/api/contracts/${contract.id}/state`, "POST", staffToken, { to: "ACTIVE" }),
      { params: Promise.resolve({ id: contract.id }) },
    );
    expect(toActiveStaff.status).toBe(403);

    // MANAGER can.
    const toActive = await stateRoute(
      await buildReq(`/api/contracts/${contract.id}/state`, "POST", managerToken, { to: "ACTIVE" }),
      { params: Promise.resolve({ id: contract.id }) },
    );
    expect(toActive.status).toBe(200);

    // Amend (B2B → new revision row).
    const amend = await amendRoute(
      await buildReq(`/api/contracts/${contract.id}/amend`, "POST", managerToken, {
        changeType: "ADD_EQUIPMENT",
        equipment: [{ equipmentId: equipment.id, unitPrice: 220_000, quantity: 1 }],
        monthlyMaintenanceFee: 220_000,
        reason: "Annual price uplift",
      }),
      { params: Promise.resolve({ id: contract.id }) },
    );
    expect(amend.status).toBe(201);
    const { body: amendBody } = await readJson(amend);
    const amendData = amendBody.data as {
      contract: { id: string; contractNumber: string; amendmentRevision: number; parentContractId: string };
      isNewRevision: boolean;
    };
    expect(amendData.isNewRevision).toBe(true);
    expect(amendData.contract.amendmentRevision).toBe(1);
    expect(amendData.contract.parentContractId).toBe(contract.id);
    expect(amendData.contract.contractNumber).toMatch(/-A1$/);

    // Renew (creates a new DRAFT chained off the amended contract).
    const renew = await renewRoute(
      await buildReq(`/api/contracts/${amendData.contract.id}/renew`, "POST", managerToken, {
        monthlyMaintenanceFee: 250_000,
        termMonths: 12,
        type: "MAINTENANCE",
      }),
      { params: Promise.resolve({ id: amendData.contract.id }) },
    );
    expect(renew.status).toBe(201);
    const { body: renewBody } = await readJson(renew);
    const renewData = renewBody.data as { contract: { id: string; state: string; type: string } };
    expect(renewData.contract.state).toBe("DRAFT");
    expect(renewData.contract.type).toBe("MAINTENANCE");
  });

  it("B2C amendment updates the parent's fee in place (no new revision row)", async () => {
    const { customer, equipment } = await createCustomerWithEquipment({ type: "B2C", name: "TEST_PHASE3_B2C_Amend" });
    const create = await contractsPost(
      await buildReq("/api/contracts", "POST", adminToken, {
        type: "RENTAL",
        customerId: customer.id,
        equipment: [{ equipmentId: equipment.id, unitPrice: 100_000, quantity: 1 }],
        monthlyMaintenanceFee: 100_000,
        termMonths: 36,
      }),
    );
    const { body } = await readJson(create);
    const contract = (body.data as { id: string });

    // Take it to ACTIVE.
    await stateRoute(
      await buildReq(`/api/contracts/${contract.id}/state`, "POST", managerToken, { to: "PENDING_SIGNATURE" }),
      { params: Promise.resolve({ id: contract.id }) },
    );
    await stateRoute(
      await buildReq(`/api/contracts/${contract.id}/state`, "POST", managerToken, { to: "ACTIVE" }),
      { params: Promise.resolve({ id: contract.id }) },
    );

    // Amend.
    const amend = await amendRoute(
      await buildReq(`/api/contracts/${contract.id}/amend`, "POST", managerToken, {
        changeType: "FEE_ADJUST",
        monthlyMaintenanceFee: 120_000,
        reason: "Inflation adjustment",
      }),
      { params: Promise.resolve({ id: contract.id }) },
    );
    expect(amend.status).toBe(200);
    const { body: amendBody } = await readJson(amend);
    const amendData = amendBody.data as { isNewRevision: boolean; contract: { id: string; monthlyMaintenanceFee: string } };
    expect(amendData.isNewRevision).toBe(false);
    expect(amendData.contract.id).toBe(contract.id);
    expect(Number(amendData.contract.monthlyMaintenanceFee)).toBe(120_000);

    // Confirm in DB.
    const final = await prisma.contract.findUnique({ where: { id: contract.id } });
    expect(Number(final?.monthlyMaintenanceFee)).toBe(120_000);
  });
});

describe("runRentalCompletionCheck", () => {
  it("flips Equipment.ownership to CUSTOMER on completed rental", async () => {
    const { customer, equipment } = await createCustomerWithEquipment({
      type: "B2C",
      name: "TEST_PHASE3_B2C_Cron",
    });
    // Activate a rental that already ended yesterday.
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rental = await prisma.contract.create({
      data: {
        contractNumber: `HD-20240101/SA-${customer.code.replace(/[^A-Z0-9]/gi, "")}-CRON`,
        customerId: customer.id,
        type: "RENTAL",
        state: "ACTIVE",
        startDate: new Date("2020-01-01"),
        endDate: past,
        termMonths: 36,
        activatedAt: new Date("2020-01-01"),
        equipment: {
          create: [{ equipmentId: equipment.id, unitPrice: 100_000, quantity: 1 }],
        },
      },
    });

    const summary = await ContractWorkflow.completeRentals();
    expect(summary.contractsCompleted).toBeGreaterThanOrEqual(1);

    const finalContract = await prisma.contract.findUnique({ where: { id: rental.id } });
    const finalEq = await prisma.equipment.findUnique({ where: { id: equipment.id } });
    expect(finalContract?.state).toBe("COMPLETED");
    expect(finalEq?.ownership).toBe("CUSTOMER");

    // A NotificationLog row should have been queued with status=MOCKED.
    const note = await prisma.notificationLog.findFirst({
      where: { customerId: customer.id, templateCode: "EMAIL_RENTAL_COMPLETED" },
    });
    expect(note?.status).toBe("MOCKED");
  });
});

describe("GET /api/contracts filtering", () => {
  it("filters by customer + type", async () => {
    const { customer, equipment } = await createCustomerWithEquipment({ type: "B2C", name: "TEST_PHASE3_B2C_Filter" });
    await contractsPost(
      await buildReq("/api/contracts", "POST", adminToken, {
        type: "MAINTENANCE",
        customerId: customer.id,
        equipment: [{ equipmentId: equipment.id, unitPrice: null, quantity: 1 }],
        monthlyMaintenanceFee: 50_000,
      }),
    );
    const res = await contractsGet(
      await buildReq(`/api/contracts?customerId=${customer.id}&type=MAINTENANCE`, "GET", adminToken),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    const rows = body.data as Array<{ type: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.type === "MAINTENANCE")).toBe(true);
  });
});
