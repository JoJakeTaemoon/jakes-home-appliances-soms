/**
 * 소모품 등록/수정 — 적용 가능한 장비(모델) is optional at creation and
 * changeable afterwards, and a blank SKU is minted by the route.
 *
 * The office loads the catalog before any model exists, so a consumable has
 * to be registerable with nothing to attach it to and linked up later.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { POST as consumablesPost } from "@/app/api/admin/products/consumables/route";
import { PATCH as consumablePatch } from "@/app/api/admin/products/consumables/[id]/route";

const MANAGER_USERNAME = "test_consumable_compat_mgr";
const MANAGER_PHONE = "9322290001";
const MODEL_CODE = "TEST-COMPAT-MODEL";
const NAME = "적용모델 없는 소모품";

let token = "";
let modelId = "";
let createdId = "";

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as { success: boolean; data?: Record<string, unknown> },
  };
}

async function cleanup() {
  const rows = await prisma.consumable.findMany({
    where: { nameKo: NAME },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.consumableOnModel.deleteMany({ where: { consumableId: { in: ids } } });
    await prisma.stockMove.deleteMany({ where: { consumableId: { in: ids } } });
    await prisma.consumable.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.consumableOnModel.deleteMany({ where: { model: { modelCode: MODEL_CODE } } });
  await prisma.equipmentModel.deleteMany({ where: { modelCode: MODEL_CODE } });
  const user = await prisma.user.findUnique({ where: { phone: MANAGER_PHONE }, select: { id: true } });
  if (user) {
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";
  await cleanup();

  const manager = await prisma.user.create({
    data: {
      username: MANAGER_USERNAME,
      phone: MANAGER_PHONE,
      email: `${MANAGER_USERNAME}@t.local`,
      passwordHash: await hashPassword("Compat-Test-123!"),
      role: "MANAGER",
    },
  });
  token = await signStaffAccessToken({
    userId: manager.id,
    username: manager.username,
    role: manager.role,
  });

  const model = await prisma.equipmentModel.create({
    data: {
      modelCode: MODEL_CODE,
      nameKo: "호환 테스트 모델",
      nameVi: "Model test",
      nameEn: "Compat test model",
    },
  });
  modelId = model.id;
});

afterAll(cleanup);

describe("소모품 — 적용 가능한 장비는 선택 사항", () => {
  it("registers with no compatible models and mints the SKU", async () => {
    const res = await consumablesPost(
      req("/api/admin/products/consumables", "POST", {
        // No sku, no compatibleModels — exactly what the blank form sends.
        nameKo: NAME,
        nameVi: NAME,
        nameEn: NAME,
        replaceEveryDays: 30,
        replaceCycleUnit: "DAY",
        retailPrice: 120000,
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    createdId = body.data!.id as string;
    expect(body.data!.sku).toMatch(/^FLT-\d{6,}$/);

    const links = await prisma.consumableOnModel.count({ where: { consumableId: createdId } });
    expect(links).toBe(0);
  });

  it("attaches a model afterwards", async () => {
    const res = await consumablePatch(
      req(`/api/admin/products/consumables/${createdId}`, "PATCH", {
        compatibleModels: [{ modelId, quantity: 2 }],
      }),
      { params: Promise.resolve({ id: createdId }) },
    );
    expect(res.status).toBe(200);

    const links = await prisma.consumableOnModel.findMany({
      where: { consumableId: createdId },
      select: { modelId: true, quantity: true },
    });
    expect(links).toEqual([{ modelId, quantity: 2 }]);
  });

  it("detaches every model again", async () => {
    const res = await consumablePatch(
      req(`/api/admin/products/consumables/${createdId}`, "PATCH", {
        compatibleModels: [],
      }),
      { params: Promise.resolve({ id: createdId }) },
    );
    expect(res.status).toBe(200);

    const links = await prisma.consumableOnModel.count({ where: { consumableId: createdId } });
    expect(links).toBe(0);
  });
});
