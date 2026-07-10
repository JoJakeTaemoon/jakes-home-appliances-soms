/**
 * Integration test for Task 1.1: GET /api/equipment-models/[id]/consumables
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { GET as consumablesGet } from "@/app/api/equipment-models/[id]/consumables/route";

const STAFF_USERNAME = "test_task11_staff";
const STAFF_PHONE = "9322210001";
const MODEL_CODE = "TEST-TASK11-MODEL";
const CONSUMABLE_SKU = "TEST-TASK11-FILTER";

let staffToken = "";
let modelId = "";
let consumableId = "";

async function buildReq(url: string, method: string, token: string) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
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
  await prisma.consumableOnModel.deleteMany({
    where: { model: { modelCode: MODEL_CODE } },
  });
  await prisma.consumable.deleteMany({ where: { sku: CONSUMABLE_SKU } });
  await prisma.equipmentModel.deleteMany({ where: { modelCode: MODEL_CODE } });
  const user = await prisma.user.findUnique({ where: { phone: STAFF_PHONE }, select: { id: true } });
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

  const pw = await hashPassword("Task11-Test-123!");
  const staff = await prisma.user.create({
    data: {
      username: STAFF_USERNAME,
      phone: STAFF_PHONE,
      email: `${STAFF_USERNAME}@t.local`,
      passwordHash: pw,
      role: "STAFF",
    },
  });
  staffToken = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });

  const model = await prisma.equipmentModel.create({
    data: { modelCode: MODEL_CODE, nameKo: "Task 1.1 test model", nameVi: "Task 1.1 test model", nameEn: "Task 1.1 test model", category: "WATER_PURIFIER" },
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

  await prisma.consumableOnModel.create({
    data: { modelId, consumableId, quantity: 2 },
  });
});

afterAll(async () => {
  await cleanup();
});

describe("GET /api/equipment-models/[id]/consumables", () => {
  it("returns the model's default consumables", async () => {
    const res = await consumablesGet(await buildReq(`/api/equipment-models/${modelId}/consumables`, "GET", staffToken), {
      params: Promise.resolve({ id: modelId }),
    });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    const data = body.data as Array<{ consumableId: string; replaceEveryDays: number | null; defaultQuantity: number }>;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      consumableId,
      replaceEveryDays: 180,
      defaultQuantity: 2,
    });
  });

  it("404s for a missing model id", async () => {
    const res = await consumablesGet(
      await buildReq(`/api/equipment-models/does-not-exist/consumables`, "GET", staffToken),
      { params: Promise.resolve({ id: "does-not-exist" }) },
    );
    expect(res.status).toBe(404);
  });
});
