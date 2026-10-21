/**
 * What the customer screen asks staff to check after a data migration:
 *   - an operations contact the system filled in (copied from the contract
 *     party) rather than one a person chose,
 *   - a live contract that never bills because it has no amount,
 *   - a unit whose filter has gone a whole cycle with no change recorded,
 *     so its due date is only a guess from the install date.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { GET as dataChecks } from "@/app/api/customers/[id]/data-checks/route";
import {
  PATCH as contactPatch,
  DELETE as contactDelete,
} from "@/app/api/customers/[id]/contacts/[contactId]/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

let staffId = "";
let token = "";
let customerId = "";
let modelId = "";
let consumableId = "";

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function checks() {
  const res = await dataChecks(req(`/api/customers/${customerId}/data-checks`, "GET"), {
    params: Promise.resolve({ id: customerId }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: {
    opsToReview: { id: string }[];
    contractsWithoutFee: { id: string }[];
    equipmentWithoutFilterDate: { id: string }[];
  } }).data;
}

async function provisionalOps() {
  return prisma.customerContact.create({
    data: {
      customerId,
      role: "OPS_CONTACT",
      scope: "CUSTOMER",
      isPrimary: true,
      needsReview: true,
      name: "Copied from contract party",
      phone1: `0944${rand()}`,
    },
  });
}

async function unitWithFilter(installedDaysAgo: number) {
  return prisma.equipment.create({
    data: {
      customerId,
      modelId,
      assetCode: `TDC-${rand()}`,
      status: "ACTIVE",
      installedAt: daysAgo(installedDaysAgo),
      consumables: { create: { consumableId, replaceEveryDays: 90 } },
    },
  });
}

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: { username: `test_data_checks_${rand()}`, phone: `0956${rand()}`, passwordHash: "x", role: "STAFF" },
  });
  staffId = staff.id;
  token = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  const customer = await prisma.customer.create({
    data: { code: `TESTDC-${rand()}`, name: "TEST_DATA_CHECKS", type: "B2C" },
  });
  customerId = customer.id;
  modelId = (await prisma.equipmentModel.create({
    data: { modelCode: `TEST-DC-${rand()}`, nameKo: "m", nameVi: "m", nameEn: "m" },
  })).id;
  consumableId = (await prisma.consumable.create({
    data: { sku: `TEST-DC-SED-${rand()}`, nameKo: "f", nameVi: "f", nameEn: "f", replaceEveryDays: 90, retailPrice: 0 },
  })).id;
});

afterAll(async () => {
  await prisma.contractEquipment.deleteMany({ where: { contract: { customerId } } });
  await prisma.contract.deleteMany({ where: { customerId } });
  await prisma.equipment.deleteMany({ where: { customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.consumable.deleteMany({ where: { id: consumableId } });
  await prisma.equipmentModel.deleteMany({ where: { id: modelId } });
  await prisma.auditLog.deleteMany({ where: { actorId: staffId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("unknown customer", () => {
  it("is a 404, not an empty list", async () => {
    const res = await dataChecks(req(`/api/customers/nope/data-checks`, "GET"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("operations contact filled in by the system", () => {
  it("is listed until staff edit it", async () => {
    const ops = await provisionalOps();
    expect((await checks()).opsToReview.map((c) => c.id)).toContain(ops.id);

    const res = await contactPatch(
      req(`/api/customers/${customerId}/contacts/${ops.id}`, "PATCH", {
        name: "Real operations lead",
        // A primary operations contact must have an email — confirming the
        // stand-in means filling it in.
        email: "ops.lead@example.com",
      }),
      { params: Promise.resolve({ id: customerId, contactId: ops.id }) },
    );
    expect(res.status).toBe(200);
    expect((await prisma.customerContact.findUnique({ where: { id: ops.id } }))?.needsReview).toBe(false);
    expect((await checks()).opsToReview.map((c) => c.id)).not.toContain(ops.id);
  });

  it("is cleared when staff remove it", async () => {
    const ops = await provisionalOps();
    const res = await contactDelete(
      req(`/api/customers/${customerId}/contacts/${ops.id}`, "DELETE"),
      { params: Promise.resolve({ id: customerId, contactId: ops.id }) },
    );
    expect(res.status).toBe(200);
    expect((await prisma.customerContact.findUnique({ where: { id: ops.id } }))?.needsReview).toBe(false);
  });
});

describe("live contract with no amount", () => {
  it("is listed, and a contract with a fee is not", async () => {
    const base = {
      customerId,
      state: "ACTIVE" as const,
      startDate: new Date("2024-01-01"),
      activatedAt: new Date("2024-01-01"),
    };
    const free = await prisma.contract.create({
      data: { ...base, contractNumber: `HD-TDC-${rand()}`, type: "MAINTENANCE" },
    });
    const paid = await prisma.contract.create({
      data: { ...base, contractNumber: `HD-TDC-${rand()}`, type: "MAINTENANCE", monthlyMaintenanceFee: 150_000 },
    });
    const ids = (await checks()).contractsWithoutFee.map((c) => c.id);
    expect(ids).toContain(free.id);
    expect(ids).not.toContain(paid.id);
  });
});

describe("filter with no change on record", () => {
  it("is listed once a whole cycle has passed since installation", async () => {
    const stale = await unitWithFilter(400);
    const fresh = await unitWithFilter(10);
    const ids = (await checks()).equipmentWithoutFilterDate.map((e) => e.id);
    expect(ids).toContain(stale.id);
    // A new install's filter is new: the install date is the real change date.
    expect(ids).not.toContain(fresh.id);
  });

  it("is not listed once staff enter the last change", async () => {
    const unit = await unitWithFilter(400);
    await prisma.equipmentConsumable.updateMany({
      where: { equipmentId: unit.id },
      data: { lastReplacedAtOverride: daysAgo(30) },
    });
    expect((await checks()).equipmentWithoutFilterDate.map((e) => e.id)).not.toContain(unit.id);
  });
});
