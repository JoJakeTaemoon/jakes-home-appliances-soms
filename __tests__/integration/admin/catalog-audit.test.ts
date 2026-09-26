/**
 * Integration: the two audit-trail gaps in the product catalog.
 *
 *   1. CSV catalog upload wrote brands / 제품군 / models straight through
 *      Prisma and logged nothing, so a bulk import left no trace at all.
 *   2. "Deleting" a model is a PATCH isActive=false (there is no DELETE
 *      route), which was logged as a plain EQUIPMENT_MODEL_UPDATE — invisible
 *      to an audit search filtered on deactivations.
 *
 * `@/lib/audit` is auto-mocked in __tests__/setup-node.ts, so the assertions
 * read the logAudit calls rather than the AuditLog table.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { POST as importCatalog } from "@/app/api/admin/products/import-catalog/route";
import { POST as modelPost } from "@/app/api/equipment-models/route";
import { PATCH as modelPatch } from "@/app/api/equipment-models/[id]/route";

const USER = "test_catalog_audit_admin";
const PHONE = "9322260001";
const BRAND = "TEST-AUDIT-BRAND";
const CAT_EN = "Test audit category";
const MODEL_CODE = "TEST-AUDIT-MODEL";
const MODEL_NAME = "Catalog audit test model";

let token = "";

const logAuditMock = vi.mocked(logAudit);
const calls = () => logAuditMock.mock.calls.map(([args]) => args);

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function csvReq(csv: string, fileName = "catalog.csv") {
  const form = new FormData();
  form.append("file", new File([csv], fileName, { type: "text/csv" }));
  return new NextRequest("http://localhost/api/admin/products/import-catalog", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}

// A model needs one 제품군; kept apart from CAT_EN so the CSV-import cases
// above still see their category as brand new.
const MODEL_CAT_CODE = "TEST_AUDIT_MODEL_CAT";

async function cleanup() {
  await prisma.equipmentModel.deleteMany({ where: { modelCode: { startsWith: "TEST-AUDIT-" } } });
  await prisma.equipmentModel.deleteMany({ where: { nameEn: MODEL_NAME } });
  await prisma.productCategory.deleteMany({ where: { nameEn: CAT_EN } });
  await prisma.productCategory.deleteMany({ where: { code: MODEL_CAT_CODE } });
  await prisma.brand.deleteMany({ where: { name: BRAND } });
  await prisma.user.deleteMany({ where: { username: USER } });
}

beforeAll(async () => {
  await cleanup();
  const staff = await prisma.user.create({
    data: {
      username: USER,
      phone: PHONE,
      passwordHash: await hashPassword("test1234"),
      role: "ADMIN",
    },
  });
  token = await signStaffAccessToken({
    userId: staff.id,
    username: staff.username,
    role: staff.role,
  });
});

afterAll(async () => {
  await cleanup();
});

beforeEach(() => {
  logAuditMock.mockClear();
});

describe("CSV catalog import", () => {
  it("writes one audit row naming everything the upload created", async () => {
    const csv = [
      "Brand,Category (EN),Category (KO),Category (VI),Model Code,Product Name (EN)",
      `${BRAND},${CAT_EN},테스트 감사 제품군,Nhóm kiểm toán,${MODEL_CODE},Audit import model`,
    ].join("\n");

    const res = await importCatalog(csvReq(csv, "2026-09-catalog.csv"));
    expect(res.status).toBe(200);

    const entry = calls().find((c) => c.action === "CATALOG_IMPORT");
    expect(entry).toBeDefined();
    expect(entry!.entityType).toBe("CatalogImport");

    const after = entry!.after as Record<string, unknown>;
    expect(after.fileName).toBe("2026-09-catalog.csv");
    expect(after.rowsProcessed).toBe(1);
    expect(after.brandsCreated).toBe(1);
    expect(after.categoriesCreated).toBe(1);
    expect(after.modelsCreated).toBe(1);
    // Names, not just counts — "where did this brand come from?" must be
    // answerable from the audit row alone.
    expect(after.newBrands).toBe(BRAND);
    expect(String(after.newCategories)).toContain(CAT_EN);
    expect(after.newModels).toBe(MODEL_CODE);
  });

  it("still logs an upload that created nothing (all rows duplicates)", async () => {
    const csv = [
      "Brand,Category (EN),Category (KO),Category (VI),Model Code",
      `${BRAND},${CAT_EN},테스트 감사 제품군,Nhóm kiểm toán,${MODEL_CODE}`,
    ].join("\n");

    await importCatalog(csvReq(csv));
    const entry = calls().find((c) => c.action === "CATALOG_IMPORT");
    expect(entry).toBeDefined();
    const after = entry!.after as Record<string, unknown>;
    expect(after.modelsCreated).toBe(0);
    expect(after.duplicatesSkipped).toBeGreaterThan(0);
    expect(after.newModels).toBeNull();
  });
});

describe("model activation state", () => {
  let modelId = "";
  let categoryId = "";

  beforeAll(async () => {
    const cat = await prisma.productCategory.create({
      data: { code: MODEL_CAT_CODE, nameKo: "감사 테스트", nameVi: "Audit test", nameEn: "Audit test" },
    });
    categoryId = cat.id;
  });

  it("logs a create", async () => {
    const res = await modelPost(
      jsonReq("/api/equipment-models", "POST", { nameEn: MODEL_NAME, categoryIds: [categoryId] }),
    );
    const body = (await res.json()) as { data: { id: string } };
    modelId = body.data.id;
    expect(res.status).toBe(201);
    expect(calls().map((c) => c.action)).toContain("EQUIPMENT_MODEL_CREATE");
  });

  it("logs a field edit as EQUIPMENT_MODEL_UPDATE", async () => {
    const res = await modelPatch(
      jsonReq(`/api/equipment-models/${modelId}`, "PATCH", { nameEn: `${MODEL_NAME} v2` }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(200);
    expect(calls()[0].action).toBe("EQUIPMENT_MODEL_UPDATE");
  });

  it("logs isActive=false as EQUIPMENT_MODEL_DEACTIVATE", async () => {
    const res = await modelPatch(
      jsonReq(`/api/equipment-models/${modelId}`, "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(200);
    const entry = calls()[0];
    expect(entry.action).toBe("EQUIPMENT_MODEL_DEACTIVATE");
    expect((entry.before as { isActive: boolean }).isActive).toBe(true);
    expect((entry.after as { isActive: boolean }).isActive).toBe(false);
  });

  it("logs isActive=true again as EQUIPMENT_MODEL_REACTIVATE", async () => {
    const res = await modelPatch(
      jsonReq(`/api/equipment-models/${modelId}`, "PATCH", { isActive: true }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(200);
    expect(calls()[0].action).toBe("EQUIPMENT_MODEL_REACTIVATE");
  });

  it("keeps UPDATE when isActive is re-sent unchanged", async () => {
    const res = await modelPatch(
      jsonReq(`/api/equipment-models/${modelId}`, "PATCH", { isActive: true, nameEn: MODEL_NAME }),
      { params: Promise.resolve({ id: modelId }) },
    );
    expect(res.status).toBe(200);
    expect(calls()[0].action).toBe("EQUIPMENT_MODEL_UPDATE");
  });
});
