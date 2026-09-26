/**
 * 제품 분류 (2026-09-26) — 제품군 · 제품 유형 · 모델 · 소모품/부속품.
 *
 *   - a 제품 유형 holds ≥ 1 제품군
 *   - a model holds ≥ 1 제품군 and 0..1 제품 유형; under a type, every 제품군
 *     must be the type's
 *   - a type may not drop a 제품군 a model of that type still uses (409)
 *   - consumables / accessories hold 0..N 제품군, search only
 *   - the real workflow: register filters with no model, then attach them from
 *     the model form (PATCH compatibleConsumables)
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { POST as typePost, GET as typeList } from "@/app/api/admin/products/product-types/route";
import { PATCH as typePatch } from "@/app/api/admin/products/product-types/[id]/route";
import { POST as modelPost, GET as modelList } from "@/app/api/equipment-models/route";
import { PATCH as modelPatch, GET as modelGet } from "@/app/api/equipment-models/[id]/route";
import { POST as consumablePost } from "@/app/api/admin/products/consumables/route";
import { POST as accessoryPost, GET as accessoryList } from "@/app/api/admin/products/accessories/route";
import { GET as modelConsumables } from "@/app/api/equipment-models/[id]/consumables/route";

const PHONE = "9322270001";
const P = "TEST_CLS_"; // every code/name this file writes starts with it

let token = "";
let catA = "";
let catB = "";
let catC = "";
let typeAB = "";

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
type Json = { success: boolean; data?: Record<string, unknown>; error?: { message?: string } };
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Json });

async function cleanup() {
  await prisma.equipmentModel.deleteMany({ where: { nameEn: { startsWith: P } } });
  await prisma.consumable.deleteMany({ where: { nameEn: { startsWith: P } } });
  await prisma.accessory.deleteMany({ where: { nameEn: { startsWith: P } } });
  await prisma.productType.deleteMany({ where: { nameEn: { startsWith: P } } });
  await prisma.productCategory.deleteMany({ where: { code: { startsWith: P } } });
  const u = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true } });
  if (u) {
    await prisma.auditLog.deleteMany({ where: { actorId: u.id } });
    await prisma.session.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";
  await cleanup();
  const mgr = await prisma.user.create({
    data: { username: "test_cls_mgr", phone: PHONE, passwordHash: await hashPassword("Cls-Test-123!"), role: "MANAGER" },
  });
  token = await signStaffAccessToken({ userId: mgr.id, username: mgr.username, role: mgr.role });
  const mk = async (s: string) =>
    (await prisma.productCategory.create({
      data: { code: `${P}${s}`, nameKo: `${P}${s}`, nameVi: `${P}${s}`, nameEn: `${P}${s}` },
    })).id;
  catA = await mk("A");
  catB = await mk("B");
  catC = await mk("C");
});

afterAll(cleanup);

describe("제품 유형", () => {
  it("refuses a type with no 제품군", async () => {
    const { status } = await read(
      await typePost(req("/api/admin/products/product-types", "POST", {
        nameKo: `${P}T0`, nameVi: `${P}T0`, nameEn: `${P}T0`, categoryIds: [],
      })),
    );
    expect(status).toBe(400);
  });

  it("creates a type across two 제품군 and mints its code", async () => {
    const { status, body } = await read(
      await typePost(req("/api/admin/products/product-types", "POST", {
        nameKo: `${P}TAB`, nameVi: `${P}TAB`, nameEn: `${P}TAB`, categoryIds: [catA, catB],
      })),
    );
    expect(status).toBe(201);
    typeAB = body.data!.id as string;
    expect(body.data!.code).toMatch(/^TEST_CLS_TAB/);
    expect(body.data!.categoryIds).toEqual([catA, catB]);
  });

  it("lists types under a 제품군", async () => {
    const underA = await read(await typeList(req(`/api/admin/products/product-types?categoryId=${catA}`, "GET")));
    const underC = await read(await typeList(req(`/api/admin/products/product-types?categoryId=${catC}`, "GET")));
    const ids = (x: Json) => (x.data as unknown as { id: string }[]).map((r) => r.id);
    expect(ids(underA.body)).toContain(typeAB);
    expect(ids(underC.body)).not.toContain(typeAB);
  });
});

describe("모델", () => {
  let modelId = "";

  it("refuses a model with no 제품군", async () => {
    const { status } = await read(await modelPost(req("/api/equipment-models", "POST", { nameEn: `${P}M0` })));
    expect(status).toBe(400);
  });

  it("refuses a typed model with a 제품군 outside the type", async () => {
    const { status, body } = await read(
      await modelPost(req("/api/equipment-models", "POST", {
        nameEn: `${P}M-bad`, categoryIds: [catA, catC], productTypeId: typeAB,
      })),
    );
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("categoryIds");
  });

  it("saves a model in two 제품군 under the type, and reads them back", async () => {
    const { status, body } = await read(
      await modelPost(req("/api/equipment-models", "POST", {
        nameEn: `${P}M1`, categoryIds: [catA, catB], productTypeId: typeAB,
      })),
    );
    expect(status).toBe(201);
    modelId = body.data!.id as string;

    const got = await read(await modelGet(req(`/api/equipment-models/${modelId}`, "GET"), params(modelId)));
    expect((got.body.data!.categoryIds as string[]).sort()).toEqual([catA, catB].sort());
    expect((got.body.data!.productType as { id: string }).id).toBe(typeAB);

    // …and the list's 제품군 filter finds it under either one.
    for (const cat of [catA, catB]) {
      const list = await read(await modelList(req(`/api/equipment-models?categoryId=${cat}&pageSize=500`, "GET")));
      expect((list.body.data as unknown as { id: string }[]).map((r) => r.id)).toContain(modelId);
    }
  });

  it("re-checks the merged state when only the type changes", async () => {
    // The model keeps A+B; clearing the type is always fine…
    const clear = await modelPatch(req(`/api/equipment-models/${modelId}`, "PATCH", { productTypeId: null }), params(modelId));
    expect(clear.status).toBe(200);
    // …moving to C alone (outside the type) while re-typing is refused.
    const bad = await modelPatch(
      req(`/api/equipment-models/${modelId}`, "PATCH", { categoryIds: [catC], productTypeId: typeAB }),
      params(modelId),
    );
    expect(bad.status).toBe(400);
    const back = await modelPatch(req(`/api/equipment-models/${modelId}`, "PATCH", { productTypeId: typeAB }), params(modelId));
    expect(back.status).toBe(200);
  });

  it("will not let the type drop a 제품군 its model still uses", async () => {
    const res = await typePatch(
      req(`/api/admin/products/product-types/${typeAB}`, "PATCH", { categoryIds: [catA] }),
      params(typeAB),
    );
    expect(res.status).toBe(409);
    const links = await prisma.productTypeCategory.count({ where: { productTypeId: typeAB } });
    expect(links).toBe(2);
  });

  it("registers filters first, then attaches them from the model form", async () => {
    // ① 소모품 with no model — and two 제품군 tags (search only)
    const filter = await read(
      await consumablePost(req("/api/admin/products/consumables", "POST", {
        nameKo: `${P}F1`, nameVi: `${P}F1`, nameEn: `${P}F1`,
        replaceEveryDays: 180, retailPrice: 90000, categoryIds: [catA, catC],
      })),
    );
    expect(filter.status).toBe(201);
    const filterId = filter.body.data!.id as string;
    expect(await prisma.consumableOnModel.count({ where: { consumableId: filterId } })).toBe(0);

    // Tagging it with 제품군 A did NOT attach it to the A model.
    const before = await read(await modelConsumables(req(`/api/equipment-models/${modelId}/consumables`, "GET"), params(modelId)));
    expect((before.body.data as unknown as unknown[]).length).toBe(0);

    // ③ attach from the model form
    const patched = await modelPatch(
      req(`/api/equipment-models/${modelId}`, "PATCH", {
        compatibleConsumables: [{ consumableId: filterId, quantity: 1, sortOrder: 0 }],
      }),
      params(modelId),
    );
    expect(patched.status).toBe(200);
    const after = await read(await modelConsumables(req(`/api/equipment-models/${modelId}/consumables`, "GET"), params(modelId)));
    expect((after.body.data as unknown as { consumableId: string }[]).map((r) => r.consumableId)).toEqual([filterId]);
  });
});

describe("부속품", () => {
  it("takes zero or more 제품군 and filters by them", async () => {
    const tagged = await read(
      await accessoryPost(req("/api/admin/products/accessories", "POST", {
        nameKo: `${P}ACC1`, nameVi: `${P}ACC1`, nameEn: `${P}ACC1`, retailPrice: 10000, categoryIds: [catB, catC],
      })),
    );
    const bare = await read(
      await accessoryPost(req("/api/admin/products/accessories", "POST", {
        nameKo: `${P}ACC2`, nameVi: `${P}ACC2`, nameEn: `${P}ACC2`, retailPrice: 10000,
      })),
    );
    expect(tagged.status).toBe(201);
    expect(bare.status).toBe(201);

    const underC = await read(await accessoryList(req(`/api/admin/products/accessories?categoryId=${catC}&pageSize=500`, "GET")));
    const rows = underC.body.data as unknown as { id: string; categoryIds: string[] }[];
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(tagged.body.data!.id);
    expect(ids).not.toContain(bare.body.data!.id);
    expect(rows.find((r) => r.id === tagged.body.data!.id)!.categoryIds.sort()).toEqual([catB, catC].sort());
  });
});
