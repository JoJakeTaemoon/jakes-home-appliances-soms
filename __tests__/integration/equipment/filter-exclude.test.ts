/**
 * Removing a catalog filter from one unit: the model keeps the filter, this
 * unit stops showing it, being reminded of it, and being suggested it.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { POST as addConsumable } from "@/app/api/equipment/[id]/consumables/route";
import { GET as serviceConfig } from "@/app/api/equipment/[id]/service-config/route";
import { GET as filterHistory } from "@/app/api/equipment/[id]/filter-history/route";
import { suggestConsumablesForVisit } from "@/lib/visits/suggest";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
let token = "";
let staffId = "";
let customerId = "";
let modelId = "";
let keptId = "";
let removedId = "";
let unitId = "";
let otherUnitId = "";

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

async function filterIds(equipmentId: string) {
  const res = await serviceConfig(req(`/api/equipment/${equipmentId}/service-config`, "GET"), {
    params: Promise.resolve({ id: equipmentId }),
  });
  const rows = ((await res.json()) as { data: { rows: { kind: string; consumableId: string | null }[] } }).data.rows;
  return rows.filter((r) => r.kind === "FILTER").map((r) => r.consumableId);
}

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: { username: `test_fx_${rand()}`, phone: `0958${rand()}`, passwordHash: "x", role: "STAFF" },
  });
  staffId = staff.id;
  token = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  customerId = (await prisma.customer.create({ data: { code: `TESTFX-${rand()}`, name: "TEST_FILTER_EXCLUDE", type: "B2C" } })).id;
  const mk = (sku: string) =>
    prisma.consumable.create({ data: { sku, nameKo: sku, nameVi: sku, nameEn: sku, replaceEveryDays: 90, retailPrice: 0 } });
  keptId = (await mk(`TEST-FX-KEEP-${rand()}`)).id;
  removedId = (await mk(`TEST-FX-DROP-${rand()}`)).id;
  modelId = (await prisma.equipmentModel.create({
    data: {
      modelCode: `TEST-FX-${rand()}`, nameKo: "m", nameVi: "m", nameEn: "m",
      consumables: { create: [{ consumableId: keptId }, { consumableId: removedId }] },
    },
  })).id;
  const unit = () =>
    prisma.equipment.create({
      data: { customerId, modelId, assetCode: `TFX-${rand()}`, status: "ACTIVE", installedAt: new Date(Date.now() - 80 * 86_400_000) },
    });
  unitId = (await unit()).id;
  otherUnitId = (await unit()).id;

  const res = await addConsumable(req(`/api/equipment/${unitId}/consumables`, "POST", { consumableId: removedId, excluded: true }), {
    params: Promise.resolve({ id: unitId }),
  });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  await prisma.equipment.deleteMany({ where: { customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.equipmentModel.deleteMany({ where: { id: modelId } });
  await prisma.consumable.deleteMany({ where: { id: { in: [keptId, removedId] } } });
  await prisma.auditLog.deleteMany({ where: { actorId: staffId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("a catalog filter removed from one unit", () => {
  it("is gone from that unit's service config and stays on the other unit", async () => {
    expect(await filterIds(unitId)).toEqual([keptId]);
    expect((await filterIds(otherUnitId)).sort()).toEqual([keptId, removedId].sort());
  });

  it("is gone from that unit's filter history", async () => {
    const res = await filterHistory(req(`/api/equipment/${unitId}/filter-history`, "GET"), {
      params: Promise.resolve({ id: unitId }),
    });
    const ids = ((await res.json()) as { data: { filters: { consumableId: string | null }[] } }).data.filters.map(
      (f) => f.consumableId,
    );
    expect(ids).not.toContain(removedId);
    expect(ids).toContain(keptId);
  });

  it("is never suggested for that unit's visits", async () => {
    const recs = await suggestConsumablesForVisit(unitId, new Date(Date.now() + 30 * 86_400_000), { windowDays: 60 });
    expect(recs.map((r) => r.consumableId)).not.toContain(removedId);
  });
});
