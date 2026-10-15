/**
 * GET /api/portal/visits/:id/documents/:docId/download — the portal's
 * 작업확인서 button. It used to link to `/${storageKey}`, which nothing
 * serves. Customer realm only, scoped to the caller's customer and, for a
 * SITE-scoped OPS contact, to their site.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { signCustomerAccessToken, signStaffAccessToken } from "@/lib/auth/jwt";
import { GET as download } from "@/app/api/portal/visits/[id]/documents/[docId]/download/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const PDF = Buffer.from("%PDF-1.4\n% test work confirmation\n%%EOF\n");
const DIR = path.join("uploads", "test-portal-download", rand());

let techId = "";
const customerIds: string[] = [];
let visitId = "";
let docId = "";
let ownerToken = "";
let otherCustomerToken = "";
let otherSiteToken = "";
let sameSiteToken = "";
let staffToken = "";

async function portalContact(customerId: string, extra: Record<string, unknown> = {}) {
  const c = await prisma.customerContact.create({
    data: {
      customerId,
      role: "OPS_CONTACT",
      scope: "CUSTOMER",
      name: "TEST_DL contact",
      phone1: `0955${rand()}`,
      language: "vi",
      portalEnabled: true,
      ...extra,
    },
  });
  return signCustomerAccessToken({
    contactId: c.id,
    customerId,
    contactRole: c.role,
  });
}

beforeAll(async () => {
  const tech = await prisma.user.create({
    data: {
      username: `test_dl_tech_${rand()}`,
      phone: `0944${rand()}`,
      passwordHash: "x",
      role: "TECHNICIAN",
    },
  });
  techId = tech.id;
  staffToken = await signStaffAccessToken({
    userId: tech.id,
    username: tech.username,
    role: "STAFF",
  });

  const owner = await prisma.customer.create({
    data: { code: `TESTDL-${rand()}`, name: "TEST_DL owner", type: "B2B" },
  });
  const other = await prisma.customer.create({
    data: { code: `TESTDL-${rand()}`, name: "TEST_DL other", type: "B2C" },
  });
  customerIds.push(owner.id, other.id);
  const siteA = await prisma.site.create({ data: { customerId: owner.id, name: "A" } });
  const siteB = await prisma.site.create({ data: { customerId: owner.id, name: "B" } });

  const visit = await prisma.visit.create({
    data: {
      customerId: owner.id,
      siteId: siteA.id,
      type: "REPAIR",
      state: "COMPLETED",
      scheduledFor: new Date(),
      leadTechnicianId: techId,
    },
  });
  visitId = visit.id;

  await fs.mkdir(path.join(process.cwd(), DIR), { recursive: true });
  const storageKey = path.join(DIR, "wc.pdf");
  await fs.writeFile(path.join(process.cwd(), storageKey), PDF);
  const doc = await prisma.document.create({
    data: {
      kind: "WORK_CONFIRMATION",
      customerId: owner.id,
      visitId,
      templateCode: "TEST",
      storageKey,
      filename: "wc.pdf",
    },
  });
  docId = doc.id;

  ownerToken = await portalContact(owner.id);
  otherCustomerToken = await portalContact(other.id);
  otherSiteToken = await portalContact(owner.id, { scope: "SITE", siteId: siteB.id });
  sameSiteToken = await portalContact(owner.id, { scope: "SITE", siteId: siteA.id });
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { id: docId } });
  await prisma.visit.deleteMany({ where: { id: visitId } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.user.deleteMany({ where: { id: techId } });
  await fs.rm(path.join(process.cwd(), DIR), { recursive: true, force: true });
});

function get(token?: string, vId = visitId, dId = docId) {
  const r = new NextRequest(
    `http://localhost/api/portal/visits/${vId}/documents/${dId}/download`,
    { headers: token ? { authorization: `Bearer ${token}` } : {} },
  );
  return download(r, { params: Promise.resolve({ id: vId, docId: dId }) });
}

describe("GET /api/portal/visits/:id/documents/:docId/download", () => {
  it("streams the PDF to the owning customer", async () => {
    const res = await get(ownerToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
  });

  it("lets a SITE-scoped contact of the visit's site download", async () => {
    expect((await get(sameSiteToken)).status).toBe(200);
  });

  it("hides another customer's document (404)", async () => {
    expect((await get(otherCustomerToken)).status).toBe(404);
  });

  it("hides another site's document from a SITE-scoped contact (404)", async () => {
    expect((await get(otherSiteToken)).status).toBe(404);
  });

  it("rejects an unknown document id on the right visit (404)", async () => {
    expect((await get(ownerToken, visitId, "nope")).status).toBe(404);
  });

  it("requires a customer login (401)", async () => {
    expect((await get()).status).toBe(401);
    expect((await get(staffToken)).status).toBe(401);
  });
});
