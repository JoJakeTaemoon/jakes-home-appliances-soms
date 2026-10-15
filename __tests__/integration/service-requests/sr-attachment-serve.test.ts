/**
 * GET /uploads/service-requests/{customerId}/{tmpId}/{filename}
 *
 * Customer-uploaded service-request photos are written there and the stored
 * url points there, but nothing served the path — the office SR detail and
 * the portal both showed broken images.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { signCustomerAccessToken, signFieldAccessToken, signStaffAccessToken } from "@/lib/auth/jwt";
import { GET as serveAttachment } from "@/app/uploads/service-requests/[customerId]/[tmpId]/[filename]/route";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const TMP = "tmp1700000000000abc";
const FILE = "1700000000000-leak.png";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const ids = { users: [] as string[], customers: [] as string[] };
const tokens: Record<string, string> = {};
let customerId = "";

async function contactToken(cid: string) {
  const c = await prisma.customerContact.create({
    data: {
      customerId: cid,
      role: "CONTRACT_PARTY",
      scope: "CUSTOMER",
      name: "TEST_SRSERVE contact",
      phone1: `0983${rand()}`,
      portalEnabled: true,
    },
  });
  return signCustomerAccessToken({ contactId: c.id, customerId: cid, contactRole: c.role });
}

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: { username: `test_srserve_staff_${rand()}`, phone: `0982${rand()}`, passwordHash: "x", role: "STAFF" },
  });
  const tech = await prisma.user.create({
    data: { username: `test_srserve_tech_${rand()}`, phone: `0981${rand()}`, passwordHash: "x", role: "TECHNICIAN" },
  });
  ids.users.push(staff.id, tech.id);
  const owner = await prisma.customer.create({ data: { code: `TESTSRS-${rand()}`, name: "TEST_SRSERVE_Owner", type: "B2C" } });
  const stranger = await prisma.customer.create({ data: { code: `TESTSRS-${rand()}`, name: "TEST_SRSERVE_Other", type: "B2C" } });
  customerId = owner.id;
  ids.customers.push(owner.id, stranger.id);

  const dir = path.join(process.cwd(), "uploads", "service-requests", customerId, TMP);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, FILE), PNG);

  tokens.staff = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  tokens.tech = await signFieldAccessToken({ userId: tech.id, username: tech.username, role: tech.role });
  tokens.owner = await contactToken(owner.id);
  tokens.stranger = await contactToken(stranger.id);
});

afterAll(async () => {
  await fs.rm(path.join(process.cwd(), "uploads", "service-requests", customerId), { recursive: true, force: true });
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids.customers } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids.customers } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
});

function get(cid: string, tmp: string, file: string, bearer?: string) {
  return serveAttachment(
    new NextRequest(`http://localhost/uploads/service-requests/${cid}/${tmp}/${file}`, {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    }),
    { params: Promise.resolve({ customerId: cid, tmpId: tmp, filename: file }) },
  );
}

describe("GET /uploads/service-requests/…", () => {
  it("serves the image to office staff", async () => {
    const res = await get(customerId, TMP, FILE, tokens.staff);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("serves the image to a portal contact of the owning customer", async () => {
    expect((await get(customerId, TMP, FILE, tokens.owner)).status).toBe(200);
  });

  it("hides it from another customer's contact", async () => {
    expect((await get(customerId, TMP, FILE, tokens.stranger)).status).toBe(404);
  });

  it("does not accept a technician's field token", async () => {
    // Only the staff and customer realms are consulted here.
    expect((await get(customerId, TMP, FILE, tokens.tech)).status).toBe(401);
  });

  it("requires a session", async () => {
    expect((await get(customerId, TMP, FILE)).status).toBe(401);
  });

  it("rejects traversal and non-image files", async () => {
    expect((await get(customerId, "..", FILE, tokens.staff)).status).toBe(404);
    expect((await get(customerId, TMP, "..%2F..%2Fsecret.png", tokens.staff)).status).toBe(404);
    expect((await get(customerId, TMP, "notes.pdf", tokens.staff)).status).toBe(404);
    expect((await get(customerId, TMP, "missing.png", tokens.staff)).status).toBe(404);
  });
});
