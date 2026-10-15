/**
 * 제품군 / 제품 유형 codes are editable by hand (2026-10-15) — and stay unique.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { PATCH as categoryPatch } from "@/app/api/admin/products/categories/[id]/route";
import { PATCH as typePatch } from "@/app/api/admin/products/product-types/[id]/route";

const PHONE = "9322260001";
const P = "TEST_CODE_EDIT_";
let token = "";
let catA = "";
let typeA = "";

function req(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanup() {
  await prisma.productType.deleteMany({ where: { code: { startsWith: P } } });
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
    data: { username: "test_code_edit_mgr", phone: PHONE, passwordHash: await hashPassword("Code-Edit-123!"), role: "MANAGER" },
  });
  token = await signStaffAccessToken({ userId: mgr.id, username: mgr.username, role: mgr.role });
  const names = (s: string) => ({ nameKo: s, nameVi: s, nameEn: s });
  catA = (await prisma.productCategory.create({ data: { code: `${P}CAT_A`, ...names("A") } })).id;
  await prisma.productCategory.create({ data: { code: `${P}CAT_B`, ...names("B") } });
  typeA = (await prisma.productType.create({
    data: { code: `${P}TYPE_A`, ...names("TA"), categories: { create: [{ categoryId: catA }] } },
  })).id;
  await prisma.productType.create({
    data: { code: `${P}TYPE_B`, ...names("TB"), categories: { create: [{ categoryId: catA }] } },
  });
});

afterAll(cleanup);

describe("제품군 code", () => {
  it("changes to a free code", async () => {
    const res = await categoryPatch(req(`/api/admin/products/categories/${catA}`, { code: `${P}CAT_RENAMED` }), params(catA));
    expect(res.status).toBe(200);
    expect((await prisma.productCategory.findUnique({ where: { id: catA } }))?.code).toBe(`${P}CAT_RENAMED`);
  });

  it("refuses a code another 제품군 holds (409)", async () => {
    const res = await categoryPatch(req(`/api/admin/products/categories/${catA}`, { code: `${P}CAT_B` }), params(catA));
    expect(res.status).toBe(409);
  });

  it("refuses a malformed code (400)", async () => {
    const res = await categoryPatch(req(`/api/admin/products/categories/${catA}`, { code: "water purifier" }), params(catA));
    expect(res.status).toBe(400);
  });

  it("accepts re-sending its own code", async () => {
    const res = await categoryPatch(req(`/api/admin/products/categories/${catA}`, { code: `${P}CAT_RENAMED` }), params(catA));
    expect(res.status).toBe(200);
  });
});

describe("제품 유형 code", () => {
  it("changes to a free code", async () => {
    const res = await typePatch(req(`/api/admin/products/product-types/${typeA}`, { code: `${P}TYPE_RENAMED` }), params(typeA));
    expect(res.status).toBe(200);
    expect((await prisma.productType.findUnique({ where: { id: typeA } }))?.code).toBe(`${P}TYPE_RENAMED`);
  });

  it("refuses a code another type holds (409, message names the code)", async () => {
    const res = await typePatch(req(`/api/admin/products/product-types/${typeA}`, { code: `${P}TYPE_B` }), params(typeA));
    expect(res.status).toBe(409);
    // The edit modal tells "code taken" from "제품군 in use" by this word in
    // the message (the envelope's own `code` key must not count).
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/code/i);
  });

  it("refuses a malformed code (400)", async () => {
    const res = await typePatch(req(`/api/admin/products/product-types/${typeA}`, { code: "tank type" }), params(typeA));
    expect(res.status).toBe(400);
  });
});
