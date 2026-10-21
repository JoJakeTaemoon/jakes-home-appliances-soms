/**
 * Entering the last filter change for many units at once — a company with
 * 100 units of a model is one form, not 100 edits.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { GET, POST } from "@/app/api/customers/[id]/equipment-filters/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
let token = "";
let staffId = "";
let customerId = "";
let otherCustomerId = "";
let modelId = "";
let filterA = "";
let filterB = "";
let plain = "";
let withOverride = "";
let excludedUnit = "";
let foreign = "";

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = async (body: unknown, id = customerId) => {
  const res = await POST(req(`/api/customers/${id}/equipment-filters`, "POST", body), ctx(id));
  return { status: res.status, body: (await res.json()) as { data?: Record<string, number> } };
};
const lastOf = async (equipmentId: string, consumableId: string) =>
  (await prisma.equipmentConsumable.findFirst({ where: { equipmentId, consumableId } }))?.lastReplacedAtOverride
    ?.toISOString()
    .slice(0, 10) ?? null;

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: { username: `test_bfd_${rand()}`, phone: `0959${rand()}`, passwordHash: "x", role: "STAFF" },
  });
  staffId = staff.id;
  token = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  customerId = (await prisma.customer.create({ data: { code: `TESTBFD-${rand()}`, name: "TEST_BULK_FILTER_DATES", type: "B2B", shortcode: `B${rand().slice(0, 4)}` } })).id;
  otherCustomerId = (await prisma.customer.create({ data: { code: `TESTBFD-${rand()}`, name: "TEST_BULK_FILTER_OTHER", type: "B2C" } })).id;
  const mk = (sku: string) =>
    prisma.consumable.create({ data: { sku, nameKo: sku, nameVi: sku, nameEn: sku, replaceEveryDays: 90, retailPrice: 0 } });
  filterA = (await mk(`TEST-BFD-A-${rand()}`)).id;
  filterB = (await mk(`TEST-BFD-B-${rand()}`)).id;
  modelId = (await prisma.equipmentModel.create({
    data: {
      modelCode: `TEST-BFD-${rand()}`, nameKo: "m", nameVi: "m", nameEn: "m",
      consumables: { create: [{ consumableId: filterA }, { consumableId: filterB }] },
    },
  })).id;
  const unit = (cid = customerId) =>
    prisma.equipment.create({
      data: { customerId: cid, modelId, assetCode: `TBFD-${rand()}`, status: "ACTIVE", installedAt: new Date("2024-01-01") },
    });
  plain = (await unit()).id;
  withOverride = (await unit()).id;
  excludedUnit = (await unit()).id;
  foreign = (await unit(otherCustomerId)).id;
  await prisma.equipmentConsumable.create({
    data: { equipmentId: withOverride, consumableId: filterA, replaceEveryDays: 60, lastReplacedAtOverride: new Date("2024-02-01") },
  });
  await prisma.equipmentConsumable.create({ data: { equipmentId: excludedUnit, consumableId: filterA, excluded: true } });
});

afterAll(async () => {
  await prisma.equipment.deleteMany({ where: { customerId: { in: [customerId, otherCustomerId] } } });
  await prisma.customer.deleteMany({ where: { id: { in: [customerId, otherCustomerId] } } });
  await prisma.equipmentModel.deleteMany({ where: { id: modelId } });
  await prisma.consumable.deleteMany({ where: { id: { in: [filterA, filterB] } } });
  await prisma.auditLog.deleteMany({ where: { actorId: staffId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("GET /api/customers/:id/equipment-filters", () => {
  it("lists each active unit with the filters it actually has", async () => {
    const res = await GET(req(`/api/customers/${customerId}/equipment-filters`, "GET"), ctx(customerId));
    expect(res.status).toBe(200);
    const units = ((await res.json()) as { data: { units: { id: string; filters: { consumableId: string }[] }[] } }).data.units;
    const filtersOf = (id: string) => units.find((u) => u.id === id)!.filters.map((f) => f.consumableId).sort();
    expect(filtersOf(plain)).toEqual([filterA, filterB].sort());
    expect(filtersOf(excludedUnit)).toEqual([filterB]);
    expect(units.map((u) => u.id)).not.toContain(foreign);
  });
});

describe("POST /api/customers/:id/equipment-filters", () => {
  it("sets the date on every chosen unit that has the filter, and leaves the rest alone", async () => {
    const r = await post({
      equipmentIds: [plain, withOverride, excludedUnit],
      entries: [{ consumableId: filterA, lastReplacedAt: "2026-09-01" }],
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ units: 3, created: 1, updated: 1, skipped: 1 });
    expect(await lastOf(plain, filterA)).toBe("2026-09-01");
    expect(await lastOf(withOverride, filterA)).toBe("2026-09-01");
    // The unit's own cycle is kept — only the date moves.
    expect((await prisma.equipmentConsumable.findFirst({ where: { equipmentId: withOverride, consumableId: filterA } }))?.replaceEveryDays).toBe(60);
    // Removed from that unit: still removed, no date.
    expect(await lastOf(excludedUnit, filterA)).toBeNull();
    expect(await lastOf(plain, filterB)).toBeNull();
  });

  it("refuses a unit that belongs to another customer", async () => {
    const r = await post({ equipmentIds: [plain, foreign], entries: [{ consumableId: filterB, lastReplacedAt: "2026-09-01" }] });
    expect(r.status).toBe(400);
    expect(await lastOf(plain, filterB)).toBeNull();
  });

  it("refuses a date in the future", async () => {
    const r = await post({ equipmentIds: [plain], entries: [{ consumableId: filterB, lastReplacedAt: "2999-01-01" }] });
    expect(r.status).toBe(400);
  });
});
