/**
 * Changing a unit's model: its filters follow the new model. The unit's own
 * filter rows for filters the new model does not carry are dropped; rows for
 * filters the new model shares keep their cycle and last-change date; a
 * filter typed in by hand (no catalog link) stays. A preview lists what goes.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { logAudit } from "@/lib/audit";
import { PATCH } from "@/app/api/equipment/[id]/route";
import { GET as preview } from "@/app/api/equipment/[id]/model-change-preview/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
let token = "";
let staffId = "";
let customerId = "";
let unitId = "";
const f: Record<string, string> = {};
let oldModel = "";
let newModel = "";

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const rowsOf = () =>
  prisma.equipmentConsumable.findMany({
    where: { equipmentId: unitId },
    select: { consumableId: true, customName: true, replaceEveryDays: true, lastReplacedAtOverride: true },
  });

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: { username: `test_mcf_${rand()}`, phone: `0956${rand()}`, passwordHash: "x", role: "MANAGER" },
  });
  staffId = staff.id;
  token = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  customerId = (await prisma.customer.create({ data: { code: `TESTMCF-${rand()}`, name: "TEST_MODEL_CHANGE", type: "B2C" } })).id;
  for (const k of ["sedI", "pre", "postI", "sedU"]) {
    f[k] = (await prisma.consumable.create({
      data: { sku: `TEST-MCF-${k}-${rand()}`, nameKo: k, nameVi: k, nameEn: k, replaceEveryDays: 90, retailPrice: 0 },
    })).id;
  }
  const model = (ids: string[]) =>
    prisma.equipmentModel.create({
      data: {
        modelCode: `TEST-MCF-${rand()}`, nameKo: "m", nameVi: "m", nameEn: "m",
        consumables: { create: ids.map((consumableId) => ({ consumableId })) },
      },
    });
  oldModel = (await model([f.sedI, f.pre, f.postI])).id;
  newModel = (await model([f.pre, f.sedU])).id;
  unitId = (await prisma.equipment.create({
    data: { customerId, modelId: oldModel, assetCode: `TMCF-${rand()}`, status: "ACTIVE", installedAt: new Date("2025-01-01") },
  })).id;
  await prisma.equipmentConsumable.createMany({
    data: [
      { equipmentId: unitId, consumableId: f.sedI, replaceEveryDays: 90, lastReplacedAtOverride: new Date("2026-09-25") },
      { equipmentId: unitId, consumableId: f.pre, replaceEveryDays: 240, lastReplacedAtOverride: new Date("2026-08-01") },
      { equipmentId: unitId, consumableId: f.postI, replaceEveryDays: 365 },
      { equipmentId: unitId, consumableId: null, customName: "손으로 넣은 필터", replaceEveryDays: 60 },
    ],
  });
});

afterAll(async () => {
  await prisma.equipment.deleteMany({ where: { customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: [oldModel, newModel] } } });
  await prisma.consumable.deleteMany({ where: { id: { in: Object.values(f) } } });
  await prisma.auditLog.deleteMany({ where: { actorId: staffId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("changing a unit's model", () => {
  it("previews the unit filters the new model does not carry", async () => {
    const res = await preview(req(`/api/equipment/${unitId}/model-change-preview?modelId=${newModel}`, "GET"), ctx(unitId));
    expect(res.status).toBe(200);
    const removed = ((await res.json()) as { data: { removed: { consumableId: string }[] } }).data.removed;
    expect(removed.map((r) => r.consumableId).sort()).toEqual([f.sedI, f.postI].sort());
  });

  it("drops those rows, keeps the shared filter's history and the hand-typed filter", async () => {
    const res = await PATCH(req(`/api/equipment/${unitId}`, "PATCH", { modelId: newModel }), ctx(unitId));
    expect(res.status).toBe(200);
    const rows = await rowsOf();
    expect(rows.map((r) => r.consumableId ?? r.customName).sort()).toEqual([f.pre, "손으로 넣은 필터"].sort());
    const pre = rows.find((r) => r.consumableId === f.pre)!;
    expect(pre.replaceEveryDays).toBe(240);
    expect(pre.lastReplacedAtOverride?.toISOString().slice(0, 10)).toBe("2026-08-01");
    // logAudit is stubbed in the node test setup — check what it was handed.
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EQUIPMENT_UPDATE",
        entityId: unitId,
        after: expect.objectContaining({ removedFilters: expect.stringMatching(/sedI/) }),
      }),
    );
  });

  it("leaves the filters alone when the model does not change", async () => {
    const before = await rowsOf();
    await PATCH(req(`/api/equipment/${unitId}`, "PATCH", { modelId: newModel, notes: "same model" }), ctx(unitId));
    expect((await rowsOf()).length).toBe(before.length);
  });
});
