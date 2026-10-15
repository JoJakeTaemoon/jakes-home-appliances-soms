/**
 * GET /uploads/visits/{visitId}/{filename} — serves the photos + signature
 * shots `storeVisitPhoto` writes to ./uploads. Nothing served them before,
 * so every stored url rendered as a broken image.
 *
 * `<img>` requests carry cookies, never the Authorization header, so the
 * matrix is exercised through each realm's access cookie (all Path=/).
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import {
  signCustomerAccessToken,
  signFieldAccessToken,
  signStaffAccessToken,
} from "@/lib/auth/jwt";
import { GET as serveUpload } from "@/app/uploads/visits/[visitId]/[filename]/route";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const FILE = "1700000000000-photo.png";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const ids = { users: [] as string[], customers: [] as string[] };
let visitId = "";
let siteVisitId = "";
const tokens: Record<string, string> = {};

async function user(role: "STAFF" | "TECHNICIAN") {
  const u = await prisma.user.create({
    data: { username: `test_serve_${role}_${rand()}`, phone: `0986${rand()}`, passwordHash: "x", role },
  });
  ids.users.push(u.id);
  return u;
}

async function contact(customerId: string, data: { scope?: "CUSTOMER" | "SITE"; siteId?: string; role?: "CONTRACT_PARTY" | "OPS_CONTACT" }) {
  const c = await prisma.customerContact.create({
    data: {
      customerId,
      role: data.role ?? "CONTRACT_PARTY",
      scope: data.scope ?? "CUSTOMER",
      siteId: data.siteId ?? null,
      name: "TEST_SERVE contact",
      phone1: `0985${rand()}`,
      portalEnabled: true,
    },
  });
  return signCustomerAccessToken({ contactId: c.id, customerId, contactRole: c.role });
}

beforeAll(async () => {
  const staff = await user("STAFF");
  const lead = await user("TECHNICIAN");
  const otherTech = await user("TECHNICIAN");
  const customer = await prisma.customer.create({
    data: { code: `TESTSV-${rand()}`, name: "TEST_SERVE_Customer", type: "B2B" },
  });
  const stranger = await prisma.customer.create({
    data: { code: `TESTSV-${rand()}`, name: "TEST_SERVE_Stranger", type: "B2C" },
  });
  ids.customers.push(customer.id, stranger.id);
  const siteA = await prisma.site.create({ data: { customerId: customer.id, name: "A" } });
  const siteB = await prisma.site.create({ data: { customerId: customer.id, name: "B" } });

  const visit = await prisma.visit.create({
    data: { customerId: customer.id, type: "REPAIR", state: "IN_PROGRESS", scheduledFor: new Date(), leadTechnicianId: lead.id },
  });
  visitId = visit.id;
  const siteVisit = await prisma.visit.create({
    data: { customerId: customer.id, siteId: siteA.id, type: "REPAIR", state: "IN_PROGRESS", scheduledFor: new Date(), leadTechnicianId: lead.id },
  });
  siteVisitId = siteVisit.id;

  for (const v of [visitId, siteVisitId]) {
    const dir = path.join(process.cwd(), "uploads", "visits", v);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, FILE), PNG);
  }

  tokens.staff = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  tokens.lead = await signFieldAccessToken({ userId: lead.id, username: lead.username, role: lead.role });
  tokens.otherTech = await signFieldAccessToken({ userId: otherTech.id, username: otherTech.username, role: otherTech.role });
  tokens.owner = await contact(customer.id, {});
  tokens.stranger = await contact(stranger.id, {});
  tokens.siteA = await contact(customer.id, { role: "OPS_CONTACT", scope: "SITE", siteId: siteA.id });
  tokens.siteB = await contact(customer.id, { role: "OPS_CONTACT", scope: "SITE", siteId: siteB.id });
});

afterAll(async () => {
  for (const v of [visitId, siteVisitId]) {
    await fs.rm(path.join(process.cwd(), "uploads", "visits", v), { recursive: true, force: true });
  }
  await prisma.visit.deleteMany({ where: { customerId: { in: ids.customers } } });
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids.customers } } });
  await prisma.site.deleteMany({ where: { customerId: { in: ids.customers } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids.customers } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
});

function get(v: string, file: string, cookie?: string, bearer?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return serveUpload(
    new NextRequest(`http://localhost/uploads/visits/${v}/${encodeURIComponent(file)}`, { headers }),
    { params: Promise.resolve({ visitId: v, filename: file }) },
  );
}

describe("GET /uploads/visits/[visitId]/[filename]", () => {
  it("401 without any realm credential", async () => {
    const res = await get(visitId, FILE);
    expect(res.status).toBe(401);
  });

  it("serves office staff via the office cookie", async () => {
    const res = await get(visitId, FILE, `officeAccessToken=${tokens.staff}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/^private/);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("serves the visit's technician via the field cookie", async () => {
    const res = await get(visitId, FILE, `fieldAccessToken=${tokens.lead}`);
    expect(res.status).toBe(200);
  });

  it("also accepts a bearer token (fetch callers)", async () => {
    const res = await get(visitId, FILE, undefined, tokens.lead);
    expect(res.status).toBe(200);
  });

  it("404 for a technician who is not on the visit", async () => {
    const res = await get(visitId, FILE, `fieldAccessToken=${tokens.otherTech}`);
    expect(res.status).toBe(404);
  });

  it("serves a portal contact of the owning customer", async () => {
    const res = await get(visitId, FILE, `customerAccessToken=${tokens.owner}`);
    expect(res.status).toBe(200);
  });

  it("404 for a portal contact of another customer", async () => {
    const res = await get(visitId, FILE, `customerAccessToken=${tokens.stranger}`);
    expect(res.status).toBe(404);
  });

  it("respects SITE scope: same site 200, other site 404", async () => {
    expect((await get(siteVisitId, FILE, `customerAccessToken=${tokens.siteA}`)).status).toBe(200);
    expect((await get(siteVisitId, FILE, `customerAccessToken=${tokens.siteB}`)).status).toBe(404);
  });

  it("grants access when any held realm cookie qualifies", async () => {
    const cookie = `customerAccessToken=${tokens.stranger}; fieldAccessToken=${tokens.lead}`;
    expect((await get(visitId, FILE, cookie)).status).toBe(200);
  });

  it("404 for a missing file", async () => {
    const res = await get(visitId, "1700000000001-nope.png", `officeAccessToken=${tokens.staff}`);
    expect(res.status).toBe(404);
  });

  it("rejects path traversal and non-image names", async () => {
    const cookie = `officeAccessToken=${tokens.staff}`;
    for (const bad of ["../../../package.json", "..", "a/../../x.png", "..\\x.png", ".env", "x.json"]) {
      const res = await get(visitId, bad, cookie);
      expect([400, 404]).toContain(res.status);
    }
    const viaVisit = await get("..", "package.json", cookie);
    expect([400, 404]).toContain(viaVisit.status);
  });

  it("404 for an unknown visit", async () => {
    const res = await get("does-not-exist", FILE, `officeAccessToken=${tokens.staff}`);
    expect(res.status).toBe(404);
  });
});
