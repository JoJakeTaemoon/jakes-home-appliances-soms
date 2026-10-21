/**
 * GET /api/equipment?installedFrom=&installedTo= — the list filtered by
 * install date, both ends inclusive calendar days.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { GET } from "@/app/api/equipment/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
let token = "";
let staffId = "";
let customerId = "";
const ids: Record<string, string> = {};

const list = async (qs: string) => {
  const res = await GET(
    new NextRequest(`http://localhost/api/equipment?customerId=${customerId}&${qs}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({}) },
  );
  const body = (await res.json()) as { data?: { id: string }[] };
  return { status: res.status, ids: (body.data ?? []).map((r) => r.id).sort() };
};

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: { username: `test_idf_${rand()}`, phone: `0958${rand()}`, passwordHash: "x", role: "STAFF" },
  });
  staffId = staff.id;
  token = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  customerId = (await prisma.customer.create({ data: { code: `TESTIDF-${rand()}`, name: "TEST_INSTALL_DATE_FILTER", type: "B2C" } })).id;
  for (const [k, d] of Object.entries({ jan: "2025-01-31", feb: "2025-02-01", mar: "2025-03-15", none: null })) {
    ids[k] = (await prisma.equipment.create({
      data: { customerId, assetCode: `TIDF-${rand()}`, customDescription: "x", status: "ACTIVE", installedAt: d ? new Date(d) : null },
    })).id;
  }
});

afterAll(async () => {
  await prisma.equipment.deleteMany({ where: { customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("GET /api/equipment install-date filter", () => {
  it("keeps units installed on or after installedFrom", async () => {
    expect((await list("installedFrom=2025-02-01")).ids).toEqual([ids.feb, ids.mar].sort());
  });

  it("keeps units installed on or before installedTo, the whole day", async () => {
    expect((await list("installedTo=2025-02-01")).ids).toEqual([ids.jan, ids.feb].sort());
  });

  it("combines both ends", async () => {
    expect((await list("installedFrom=2025-02-01&installedTo=2025-02-28")).ids).toEqual([ids.feb]);
  });

  it("rejects a malformed date", async () => {
    expect((await list("installedFrom=2025-13-40")).status).toBe(400);
  });
});
