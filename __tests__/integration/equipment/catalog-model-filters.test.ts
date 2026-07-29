/**
 * Integration test (WS-A1): a model's filter config is written from the model
 * side (compatibleConsumables → ConsumableOnModel), with per-model cycle
 * override + order, and the override flows through the model→filter read.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { POST as modelPost } from "@/app/api/equipment-models/route";
import { GET as modelGet, PATCH as modelPatch } from "@/app/api/equipment-models/[id]/route";
import { GET as modelConsumablesGet } from "@/app/api/equipment-models/[id]/consumables/route";
import { POST as consumablePost } from "@/app/api/admin/products/consumables/route";

const USER = "test_wsa1_admin";
const PHONE = "9322250001";
const MODEL_NAME = "WSA1 Test Model";
const SKU1 = "TEST-WSA1-F1";
const SKU2 = "TEST-WSA1-F2";
const SKU3 = "TEST-WSA1-MONTH";

let token = "";
let modelId = "";
let c1Id = "";
let c2Id = "";

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function readJson(res: Response) {
  return { status: res.status, body: (await res.json()) as { success: boolean; data?: any } };
}

async function cleanup() {
  await prisma.consumableOnModel.deleteMany({ where: { model: { nameEn: MODEL_NAME } } });
  await prisma.equipmentModel.deleteMany({ where: { nameEn: MODEL_NAME } });
  await prisma.consumableOnModel.deleteMany({ where: { consumable: { sku: { in: [SKU1, SKU2, SKU3] } } } });
  await prisma.consumable.deleteMany({ where: { sku: { in: [SKU1, SKU2, SKU3] } } });
  const u = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true } });
  if (u) {
    await prisma.session.deleteMany({ where: { userId: u.id } });
    await prisma.auditLog.deleteMany({ where: { actorId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";
  await cleanup();

  const admin = await prisma.user.create({
    data: { username: USER, phone: PHONE, email: `${USER}@t.local`, passwordHash: await hashPassword("Wsa1-Test-123!"), role: "ADMIN" },
  });
  token = await signStaffAccessToken({ userId: admin.id, username: admin.username, role: admin.role });

  const f1 = await prisma.consumable.create({ data: { sku: SKU1, nameKo: "F1", nameVi: "F1", nameEn: "F1", replaceEveryDays: 180, retailPrice: 50_000 } });
  const f2 = await prisma.consumable.create({ data: { sku: SKU2, nameKo: "F2", nameVi: "F2", nameEn: "F2", replaceEveryDays: 90, retailPrice: 40_000 } });
  c1Id = f1.id;
  c2Id = f2.id;
});

afterAll(async () => {
  await cleanup();
});

describe("model filter config (WS-A1)", () => {
  it("creates a model with its filter config (ConsumableOnModel) + per-model override + order", async () => {
    const res = await modelPost(
      req("/api/equipment-models", "POST", {
        nameEn: MODEL_NAME,
        category: "WATER_PURIFIER",
        compatibleConsumables: [
          { consumableId: c2Id, quantity: 2, sortOrder: 0 }, // no override → 90
          { consumableId: c1Id, quantity: 1, sortOrder: 1, replaceEveryDaysOverride: 45 }, // override 45 (< 180)
        ],
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    modelId = body.data.id;

    const links = await prisma.consumableOnModel.findMany({ where: { modelId }, orderBy: { sortOrder: "asc" } });
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ consumableId: c2Id, quantity: 2, sortOrder: 0, replaceEveryDaysOverride: null });
    expect(links[1]).toMatchObject({ consumableId: c1Id, quantity: 1, sortOrder: 1, replaceEveryDaysOverride: 45 });
  });

  it("exposes the per-model cycle override + order in the model→filter read", async () => {
    const res = await modelConsumablesGet(req(`/api/equipment-models/${modelId}/consumables`, "GET"), {
      params: Promise.resolve({ id: modelId }),
    });
    const { body } = await readJson(res);
    const rows = body.data as Array<{ consumableId: string; replaceEveryDays: number | null }>;
    // Ordered by sortOrder; the override (45) wins over the filter default (180).
    expect(rows[0].consumableId).toBe(c2Id);
    expect(rows[1].consumableId).toBe(c1Id);
    expect(rows[1].replaceEveryDays).toBe(45);
  });

  it("replaces the filter config wholesale on PATCH", async () => {
    const res = await modelPatch(
      req(`/api/equipment-models/${modelId}`, "PATCH", {
        compatibleConsumables: [{ consumableId: c1Id, quantity: 1, sortOrder: 0 }],
      }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(200);
    const links = await prisma.consumableOnModel.findMany({ where: { modelId } });
    expect(links).toHaveLength(1);
    expect(links[0].consumableId).toBe(c1Id);

    // GET [id] includes the config for prefill.
    const getRes = await modelGet(req(`/api/equipment-models/${modelId}`, "GET"), { params: Promise.resolve({ id: modelId }) });
    const { body } = await readJson(getRes);
    expect((body.data.consumables as unknown[])).toHaveLength(1);
  });

  it("rejects a duplicate consumableId in the filter config", async () => {
    const res = await modelPatch(
      req(`/api/equipment-models/${modelId}`, "PATCH", {
        compatibleConsumables: [
          { consumableId: c1Id, quantity: 1, sortOrder: 0 },
          { consumableId: c1Id, quantity: 1, sortOrder: 1 },
        ],
      }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(400);
    // Unchanged: still the single c1 link from the previous test.
    const links = await prisma.consumableOnModel.findMany({ where: { modelId } });
    expect(links).toHaveLength(1);
  });

  it("leaves the filter config untouched when compatibleConsumables is omitted", async () => {
    const res = await modelPatch(
      req(`/api/equipment-models/${modelId}`, "PATCH", { description: "just a note" }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(200);
    const links = await prisma.consumableOnModel.findMany({ where: { modelId } });
    expect(links).toHaveLength(1); // preserved
  });

  it("clears the filter config when compatibleConsumables is an empty array", async () => {
    const res = await modelPatch(
      req(`/api/equipment-models/${modelId}`, "PATCH", { compatibleConsumables: [] }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(200);
    const links = await prisma.consumableOnModel.findMany({ where: { modelId } });
    expect(links).toHaveLength(0);
  });

  it("persists the filter cycle unit (일/개월) on the consumable", async () => {
    const res = await consumablePost(
      req("/api/admin/products/consumables", "POST", {
        sku: SKU3, nameKo: "M", nameVi: "M", nameEn: "M",
        replaceEveryDays: 180, replaceCycleUnit: "MONTH", retailPrice: 30_000,
      }),
    );
    expect(res.status).toBe(201);
    const row = await prisma.consumable.findUnique({ where: { sku: SKU3 } });
    expect(row?.replaceCycleUnit).toBe("MONTH");
  });
});
