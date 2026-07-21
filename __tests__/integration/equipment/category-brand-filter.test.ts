/**
 * Integration test (WS3): GET /api/admin/products/categories?brandId=…
 *
 * Brand and ProductCategory have no direct relation — they're joined only
 * through EquipmentModel. The `brandId` filter must therefore return exactly
 * the categories that own at least one model of that brand.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { GET as categoriesGet } from "@/app/api/admin/products/categories/route";

const STAFF_USERNAME = "test_ws3_staff";
const STAFF_PHONE = "9322230001";
const BRAND_NAME = "WS3 Test Brand";
const MODEL_CODE = "TEST-WS3-MODEL";
const CAT_WITH = "TEST_WS3_CAT_WITH";
const CAT_WITHOUT = "TEST_WS3_CAT_WITHOUT";

let staffToken = "";
let brandId = "";
let catWithId = "";
let catWithoutId = "";

async function readJson(res: Response) {
  const body = (await res.json()) as {
    success: boolean;
    data?: Array<{ id: string; code: string }>;
  };
  return { status: res.status, body };
}

function req(url: string) {
  return new NextRequest(`http://localhost${url}`, {
    method: "GET",
    headers: { authorization: `Bearer ${staffToken}` },
  });
}

async function cleanup() {
  await prisma.equipmentModel.deleteMany({ where: { modelCode: MODEL_CODE } });
  await prisma.productCategory.deleteMany({ where: { code: { in: [CAT_WITH, CAT_WITHOUT] } } });
  await prisma.brand.deleteMany({ where: { name: BRAND_NAME } });
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

  const pw = await hashPassword("Ws3-Test-123!");
  const staff = await prisma.user.create({
    data: { username: STAFF_USERNAME, phone: STAFF_PHONE, email: `${STAFF_USERNAME}@t.local`, passwordHash: pw, role: "STAFF" },
  });
  staffToken = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });

  const brand = await prisma.brand.create({ data: { name: BRAND_NAME } });
  brandId = brand.id;

  const catWith = await prisma.productCategory.create({
    data: { code: CAT_WITH, nameKo: "가진 제품군", nameVi: "cat with", nameEn: "cat with" },
  });
  catWithId = catWith.id;
  const catWithout = await prisma.productCategory.create({
    data: { code: CAT_WITHOUT, nameKo: "없는 제품군", nameVi: "cat without", nameEn: "cat without" },
  });
  catWithoutId = catWithout.id;

  // Only CAT_WITH owns a model of this brand.
  await prisma.equipmentModel.create({
    data: { modelCode: MODEL_CODE, nameKo: "M", nameVi: "M", nameEn: "M", brandId, categoryId: catWithId },
  });
});

afterAll(async () => {
  await cleanup();
});

describe("GET /api/admin/products/categories?brandId", () => {
  it("returns only categories that own a model of the brand", async () => {
    const res = await categoriesGet(req(`/api/admin/products/categories?brandId=${brandId}&pageSize=500`));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    const ids = (body.data ?? []).map((c) => c.id);
    expect(ids).toContain(catWithId);
    expect(ids).not.toContain(catWithoutId);
  });

  it("returns both categories when no brand filter is applied", async () => {
    const res = await categoriesGet(req(`/api/admin/products/categories?pageSize=500`));
    const { body } = await readJson(res);
    const ids = (body.data ?? []).map((c) => c.id);
    expect(ids).toContain(catWithId);
    expect(ids).toContain(catWithoutId);
  });
});
