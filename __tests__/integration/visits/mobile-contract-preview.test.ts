/**
 * GET /api/mobile/visits/[id]/preview/CONTRACT — the contract a technician
 * shows the customer on an INSTALLATION visit. The field page used to frame
 * the office-only /api/contracts/{id}/pdf, which 403s every technician.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { signFieldAccessToken } from "@/lib/auth/jwt";
import { GET as previewRoute } from "@/app/api/mobile/visits/[id]/preview/[kind]/route";

const UPLOADED_PDF = Buffer.from("%PDF-1.4\n% uploaded signed copy\n%%EOF\n");
const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");

const userIds: string[] = [];
const customerIds: string[] = [];
const contractNumbers: string[] = [];
let uploadDir = "";
let leadToken = "";
let otherToken = "";
let uploadedVisitId = "";
let renderedVisitId = "";
let repairVisitId = "";

async function tech() {
  const u = await prisma.user.create({
    data: { username: `test_cprev_${rand()}`, phone: `0984${rand()}`, passwordHash: "x", role: "TECHNICIAN" },
  });
  userIds.push(u.id);
  return { u, token: await signFieldAccessToken({ userId: u.id, username: u.username, role: u.role }) };
}

async function customerWithContract(pdfStorageKey: string | null) {
  const customer = await prisma.customer.create({
    data: { code: `TESTCP-${rand()}`, name: "TEST_CPREV_Customer", type: "B2C" },
  });
  customerIds.push(customer.id);
  await prisma.customerContact.create({
    data: { customerId: customer.id, role: "CONTRACT_PARTY", name: "TEST_CPREV party", phone1: `0983${rand()}` },
  });
  const contractNumber = `HD-TEST-CPREV-${rand()}`;
  contractNumbers.push(contractNumber);
  await prisma.contract.create({
    data: { contractNumber, customerId: customer.id, type: "SALE", state: "ACTIVE", activatedAt: new Date(), pdfStorageKey },
  });
  return customer.id;
}

async function visit(customerId: string, leadId: string, type: "INSTALLATION" | "REPAIR") {
  const v = await prisma.visit.create({
    data: { customerId, type, state: "SCHEDULED", scheduledFor: new Date(), leadTechnicianId: leadId },
  });
  return v.id;
}

beforeAll(async () => {
  const lead = await tech();
  const other = await tech();
  leadToken = lead.token;
  otherToken = other.token;

  uploadDir = path.join(process.cwd(), "uploads", "contracts", `test-cprev-${rand()}`);
  await fs.mkdir(uploadDir, { recursive: true });
  const uploadedKey = path.relative(process.cwd(), path.join(uploadDir, "signed.pdf"));
  await fs.writeFile(path.join(uploadDir, "signed.pdf"), UPLOADED_PDF);

  const withUpload = await customerWithContract(uploadedKey);
  uploadedVisitId = await visit(withUpload, lead.u.id, "INSTALLATION");
  repairVisitId = await visit(withUpload, lead.u.id, "REPAIR");
  const withoutUpload = await customerWithContract(null);
  renderedVisitId = await visit(withoutUpload, lead.u.id, "INSTALLATION");
});

afterAll(async () => {
  await fs.rm(uploadDir, { recursive: true, force: true });
  for (const cn of contractNumbers) {
    await fs.rm(path.join(process.cwd(), "uploads", "contracts", `${cn}.pdf`), { force: true });
  }
  await prisma.document.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.visit.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.contract.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customerContact.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

function get(visitId: string, token: string, kind = "CONTRACT") {
  return previewRoute(
    new NextRequest(`http://localhost/api/mobile/visits/${visitId}/preview/${kind}`, {
      headers: { cookie: `fieldAccessToken=${token}` },
    }),
    { params: Promise.resolve({ id: visitId, kind }) },
  );
}

describe("GET /api/mobile/visits/[id]/preview/CONTRACT", () => {
  it("streams the uploaded signed contract to the lead technician", async () => {
    const res = await get(uploadedVisitId, leadToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).equals(UPLOADED_PDF)).toBe(true);
  });

  it("renders the contract when nothing was uploaded", async () => {
    const res = await get(renderedVisitId, leadToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  }, 60_000);

  it("404 for a technician who is not on the visit", async () => {
    const res = await get(uploadedVisitId, otherToken);
    expect(res.status).toBe(404);
  });

  it("404 when the visit is not an installation", async () => {
    const res = await get(repairVisitId, leadToken);
    expect(res.status).toBe(404);
  });
});
