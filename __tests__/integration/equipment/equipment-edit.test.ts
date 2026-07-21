/**
 * Integration test (WS1): PATCH /api/equipment/[id] full edit + override anchors.
 *
 * Covers:
 *  - the silent-drop bug fix: customDescription + customMaintenanceCycleDays
 *    are actually persisted now (validated-but-dropped before).
 *  - newly-editable fields: modelId / salePrice / installFee / siteId.
 *  - lastInspectionAtOverride re-anchors the service-config next-due date.
 *  - a site from another customer is rejected.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { addDays } from "@/lib/contracts/pause-period";

import { PATCH as equipmentPatch } from "@/app/api/equipment/[id]/route";
import { GET as serviceConfigGet } from "@/app/api/equipment/[id]/service-config/route";

const ADMIN_USERNAME = "test_ws1_admin";
const ADMIN_PHONE = "9322240001";
const MODEL_CODE_A = "TEST-WS1-MODEL-A";
const MODEL_CODE_B = "TEST-WS1-MODEL-B";
const C1_NAME = "WS1 Cust One";
const C2_NAME = "WS1 Cust Two";

let token = "";
let equipmentId = "";
let modelBId = "";
let site1Id = "";
let site2Id = "";
let c1Id = "";
let c2Id = "";

function patchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/equipment/${id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getReq(id: string) {
  return new NextRequest(`http://localhost/api/equipment/${id}/service-config`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}
async function readJson(res: Response) {
  return { status: res.status, body: (await res.json()) as { success: boolean; data?: Record<string, unknown> } };
}

async function cleanup() {
  await prisma.equipment.deleteMany({ where: { customer: { name: { in: [C1_NAME, C2_NAME] } } } });
  await prisma.site.deleteMany({ where: { customer: { name: { in: [C1_NAME, C2_NAME] } } } });
  await prisma.customer.deleteMany({ where: { name: { in: [C1_NAME, C2_NAME] } } });
  await prisma.equipmentModel.deleteMany({ where: { modelCode: { in: [MODEL_CODE_A, MODEL_CODE_B] } } });
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

  const pw = await hashPassword("Ws1-Test-123!");
  const admin = await prisma.user.create({
    data: { username: ADMIN_USERNAME, phone: ADMIN_PHONE, email: `${ADMIN_USERNAME}@t.local`, passwordHash: pw, role: "ADMIN" },
  });
  token = await signStaffAccessToken({ userId: admin.id, username: admin.username, role: admin.role });

  const modelA = await prisma.equipmentModel.create({
    data: { modelCode: MODEL_CODE_A, nameKo: "A", nameVi: "A", nameEn: "A", category: "WATER_PURIFIER", inspectionEveryDays: 90 },
  });
  const modelB = await prisma.equipmentModel.create({
    data: { modelCode: MODEL_CODE_B, nameKo: "B", nameVi: "B", nameEn: "B", category: "WATER_PURIFIER" },
  });
  modelBId = modelB.id;

  const c1 = await prisma.customer.create({ data: { code: "TESTWS1C1", type: "B2B", name: C1_NAME } });
  const c2 = await prisma.customer.create({ data: { code: "TESTWS1C2", type: "B2B", name: C2_NAME } });
  c1Id = c1.id;
  c2Id = c2.id;
  const s1 = await prisma.site.create({ data: { customerId: c1.id, name: "S1" } });
  const s2 = await prisma.site.create({ data: { customerId: c2.id, name: "S2" } });
  site1Id = s1.id;
  site2Id = s2.id;

  const eq = await prisma.equipment.create({
    data: {
      customerId: c1.id,
      modelId: modelA.id,
      installedAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "ACTIVE",
      ownership: "COMPANY",
    },
  });
  equipmentId = eq.id;
});

afterAll(async () => {
  await cleanup();
});

describe("PATCH /api/equipment/[id] — full edit", () => {
  it("persists customDescription + customMaintenanceCycleDays (previously dropped)", async () => {
    const res = await equipmentPatch(
      patchReq(equipmentId, { customDescription: "관리자 수정 설명", customMaintenanceCycleDays: 200 }),
      { params: Promise.resolve({ id: equipmentId }) },
    );
    expect(res.status).toBe(200);
    const row = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    expect(row?.customDescription).toBe("관리자 수정 설명");
    expect(row?.customMaintenanceCycleDays).toBe(200);
  });

  it("persists newly-editable model / pricing fields", async () => {
    const res = await equipmentPatch(
      patchReq(equipmentId, { modelId: modelBId, salePrice: 5_000_000, installFee: 300_000 }),
      { params: Promise.resolve({ id: equipmentId }) },
    );
    expect(res.status).toBe(200);
    const row = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    expect(row?.modelId).toBe(modelBId);
    expect(Number(row?.salePrice)).toBe(5_000_000);
    expect(Number(row?.installFee)).toBe(300_000);
  });

  it("re-anchors the inspection next-due date from lastInspectionAtOverride", async () => {
    // Give the equipment a concrete inspection cycle + an override anchor.
    await equipmentPatch(
      patchReq(equipmentId, {
        customInspectionCycleDays: 30,
        lastInspectionAtOverride: "2026-06-01T00:00:00.000Z",
      }),
      { params: Promise.resolve({ id: equipmentId }) },
    );
    const res = await serviceConfigGet(getReq(equipmentId), { params: Promise.resolve({ id: equipmentId }) });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    const rows = (body.data as { rows: Array<{ kind: string; lastAt: string | null; nextDueAt: string | null }> }).rows;
    const inspection = rows.find((r) => r.kind === "INSPECTION")!;
    expect(inspection.lastAt).toBe("2026-06-01T00:00:00.000Z");
    const expected = addDays(new Date("2026-06-01T00:00:00.000Z"), 30).toISOString();
    expect(inspection.nextDueAt).toBe(expected);
  });

  it("rejects a site that belongs to another customer", async () => {
    const res = await equipmentPatch(
      patchReq(equipmentId, { siteId: site2Id }),
      { params: Promise.resolve({ id: equipmentId }) },
    );
    expect(res.status).toBe(400);
    const row = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    expect(row?.siteId).toBeNull();
  });

  it("accepts a site of the equipment's own customer", async () => {
    const res = await equipmentPatch(
      patchReq(equipmentId, { siteId: site1Id }),
      { params: Promise.resolve({ id: equipmentId }) },
    );
    expect(res.status).toBe(200);
    const row = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    expect(row?.siteId).toBe(site1Id);
  });

  it("clears a text field when blanked (empty string → null)", async () => {
    await equipmentPatch(patchReq(equipmentId, { serialNumber: "SN-123" }), {
      params: Promise.resolve({ id: equipmentId }),
    });
    let row = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    expect(row?.serialNumber).toBe("SN-123");

    const res = await equipmentPatch(patchReq(equipmentId, { serialNumber: "" }), {
      params: Promise.resolve({ id: equipmentId }),
    });
    expect(res.status).toBe(200);
    row = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    expect(row?.serialNumber).toBeNull();
  });

  it("rejects a non-existent modelId with 400 (not a 500)", async () => {
    const res = await equipmentPatch(patchReq(equipmentId, { modelId: "does-not-exist" }), {
      params: Promise.resolve({ id: equipmentId }),
    });
    expect(res.status).toBe(400);
  });
});
