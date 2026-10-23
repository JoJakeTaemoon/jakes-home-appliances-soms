/**
 * A unit's own filter cycle entered in months steps calendar months:
 * last change 2026-08-22 + 6 개월 = 2027-02-22 (not +180 days = 2027-02-18).
 * Service config, filter history and visit suggestions all agree.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { POST as addConsumable } from "@/app/api/equipment/[id]/consumables/route";
import { PATCH as patchConsumable } from "@/app/api/equipment/[id]/consumables/[consumableLinkId]/route";
import { GET as serviceConfig } from "@/app/api/equipment/[id]/service-config/route";
import { GET as filterHistory } from "@/app/api/equipment/[id]/filter-history/route";
import { suggestConsumablesForVisit } from "@/lib/visits/suggest";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
let token = "";
let staffId = "";
let customerId = "";
let modelId = "";
let filterId = "";
let unitId = "";
let linkId = "";

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function configRow() {
  const res = await serviceConfig(req(`/api/equipment/${unitId}/service-config`, "GET"), ctx(unitId));
  const rows = ((await res.json()) as { data: { rows: { consumableId: string | null; nextDueAt: string | null; userCycleMonths: number | null; userCycleUnit: string | null }[] } }).data.rows;
  return rows.find((r) => r.consumableId === filterId)!;
}

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: { username: `test_cu_${rand()}`, phone: `0957${rand()}`, passwordHash: "x", role: "STAFF" },
  });
  staffId = staff.id;
  token = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  customerId = (await prisma.customer.create({ data: { code: `TESTCU-${rand()}`, name: "TEST_CYCLE_UNIT", type: "B2C" } })).id;
  filterId = (await prisma.consumable.create({
    data: { sku: `TEST-CU-${rand()}`, nameKo: "f", nameVi: "f", nameEn: "f", replaceEveryDays: 90, retailPrice: 0 },
  })).id;
  modelId = (await prisma.equipmentModel.create({
    data: { modelCode: `TEST-CU-${rand()}`, nameKo: "m", nameVi: "m", nameEn: "m", consumables: { create: [{ consumableId: filterId }] } },
  })).id;
  unitId = (await prisma.equipment.create({
    data: { customerId, modelId, assetCode: `TCU-${rand()}`, status: "ACTIVE", installedAt: new Date("2026-01-01") },
  })).id;
  const res = await addConsumable(
    req(`/api/equipment/${unitId}/consumables`, "POST", {
      consumableId: filterId, quantity: 1, replaceEveryDays: 180, replaceCycleUnit: "MONTH", lastReplacedAtOverride: "2026-08-22",
    }),
    ctx(unitId),
  );
  expect(res.status).toBe(201);
  linkId = ((await res.json()) as { data: { id: string } }).data.id;
});

afterAll(async () => {
  await prisma.equipment.deleteMany({ where: { customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.equipmentModel.deleteMany({ where: { id: modelId } });
  await prisma.consumable.deleteMany({ where: { id: filterId } });
  await prisma.auditLog.deleteMany({ where: { actorId: staffId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("a unit's filter cycle in months", () => {
  it("shows its unit and falls due on the same day six calendar months on", async () => {
    const row = await configRow();
    expect(row.userCycleUnit).toBe("MONTH");
    expect(row.userCycleMonths).toBe(180);
    expect(row.nextDueAt?.slice(0, 10)).toBe("2027-02-22");
  });

  it("agrees in the filter history", async () => {
    const res = await filterHistory(req(`/api/equipment/${unitId}/filter-history`, "GET"), ctx(unitId));
    const f = ((await res.json()) as { data: { filters: { consumableId: string | null; nextDueAt: string | null }[] } }).data.filters.find(
      (x) => x.consumableId === filterId,
    )!;
    expect(f.nextDueAt?.slice(0, 10)).toBe("2027-02-22");
  });

  it("agrees in the visit suggestions", async () => {
    const recs = await suggestConsumablesForVisit(unitId, new Date("2027-02-20T00:00:00Z"), { windowDays: 30 });
    const rec = recs.find((r) => r.consumableId === filterId)!;
    expect(rec.nextDueAt.toISOString().slice(0, 10)).toBe("2027-02-22");
  });

  it("goes back to day counting when the unit is switched to days", async () => {
    const res = await patchConsumable(
      req(`/api/equipment/${unitId}/consumables/${linkId}`, "PATCH", { replaceCycleUnit: "DAY" }),
      { params: Promise.resolve({ id: unitId, consumableLinkId: linkId }) },
    );
    expect(res.status).toBe(200);
    expect((await configRow()).nextDueAt?.slice(0, 10)).toBe("2027-02-18");
  });

  it("reads a cycle saved without a unit as days, so an old days-only editor cannot leave a stale month unit", async () => {
    await patchConsumable(
      req(`/api/equipment/${unitId}/consumables/${linkId}`, "PATCH", { replaceEveryDays: 180, replaceCycleUnit: "MONTH" }),
      { params: Promise.resolve({ id: unitId, consumableLinkId: linkId }) },
    );
    await patchConsumable(
      req(`/api/equipment/${unitId}/consumables/${linkId}`, "PATCH", { replaceEveryDays: 200 }),
      { params: Promise.resolve({ id: unitId, consumableLinkId: linkId }) },
    );
    const row = await configRow();
    expect(row.userCycleUnit).toBe("DAY");
    expect(row.nextDueAt?.slice(0, 10)).toBe("2027-03-10");
  });
});
