/**
 * Integration test for Task 1.5 — manual contract-PDF upload override.
 *
 * Covers:
 *   - POST /api/contracts/[id]/pdf/upload (MANAGER+, multipart) → 200,
 *     pdfStorageKey + pdfUploadedAt set on the Contract row.
 *   - GET /api/contracts/[id]/pdf then streams the uploaded bytes.
 *   - STAFF upload → 403.
 *   - non-PDF / >10MB upload → 400.
 *   - a contract with no upload still falls through to the render path.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { POST as contractsPost } from "@/app/api/contracts/route";
import { POST as uploadRoute } from "@/app/api/contracts/[id]/pdf/upload/route";
import { GET as pdfGetRoute } from "@/app/api/contracts/[id]/pdf/route";

const ADMIN_USERNAME = "test_pdfupload_admin";
const MANAGER_USERNAME = "test_pdfupload_manager";
const STAFF_USERNAME = "test_pdfupload_staff";
const ADMIN_PHONE = "9322300001";
const MANAGER_PHONE = "9322300002";
const STAFF_PHONE = "9322300003";

let adminToken = "";
let managerToken = "";
let staffToken = "";
let modelId = "";

const MINIMAL_PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

function multipartRequest(url: string, method: string, token: string, form: FormData) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    body: form as unknown as BodyInit,
  });
}

async function readJson(res: Response) {
  const status = res.status;
  const body = (await res.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  return { status, body };
}

async function cleanup() {
  const customers = await prisma.customer.findMany({
    where: { name: { startsWith: "TEST_PDFUPLOAD_" } },
    select: { id: true },
  });
  for (const c of customers) {
    const contractIds = (
      await prisma.contract.findMany({ where: { customerId: c.id }, select: { id: true } })
    ).map((r) => r.id);
    await prisma.document.deleteMany({ where: { customerId: c.id } });
    await prisma.contractEquipment.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.contract.deleteMany({ where: { customerId: c.id } });
    await prisma.equipment.deleteMany({ where: { customerId: c.id } });
    await prisma.customerContact.deleteMany({ where: { customerId: c.id } });
    await prisma.customer.delete({ where: { id: c.id } });
  }
  await prisma.equipmentModel.deleteMany({ where: { modelCode: "TEST-PDFUPLOAD-MODEL" } });
  for (const phone of [ADMIN_PHONE, MANAGER_PHONE, STAFF_PHONE]) {
    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
  // Sweep any files written under uploads/contracts/ during this test file.
  const dir = path.join(process.cwd(), "uploads", "contracts");
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir)) {
      if (createdContractDirs.has(entry)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      }
    }
  }
}

const createdContractDirs = new Set<string>();

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";

  await cleanup();

  const pw = await hashPassword("PdfUpload-Test-123!");
  const admin = await prisma.user.create({ data: { username: ADMIN_USERNAME, phone: ADMIN_PHONE, email: `${ADMIN_USERNAME}@t.local`, passwordHash: pw, role: "ADMIN" } });
  const manager = await prisma.user.create({ data: { username: MANAGER_USERNAME, phone: MANAGER_PHONE, email: `${MANAGER_USERNAME}@t.local`, passwordHash: pw, role: "MANAGER" } });
  const staff = await prisma.user.create({ data: { username: STAFF_USERNAME, phone: STAFF_PHONE, email: `${STAFF_USERNAME}@t.local`, passwordHash: pw, role: "STAFF" } });
  adminToken = await signStaffAccessToken({ userId: admin.id, username: admin.username, role: admin.role });
  managerToken = await signStaffAccessToken({ userId: manager.id, username: manager.username, role: manager.role });
  staffToken = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });

  const model = await prisma.equipmentModel.upsert({
    where: { modelCode: "TEST-PDFUPLOAD-MODEL" },
    update: {},
    create: { modelCode: "TEST-PDFUPLOAD-MODEL", nameKo: "PDF upload test model", nameVi: "PDF upload test model", nameEn: "PDF upload test model", category: "WATER_PURIFIER" },
  });
  modelId = model.id;
});

afterAll(async () => {
  await cleanup();
});

async function createContract(name: string) {
  const customer = await prisma.customer.create({
    data: {
      code: `TESTKHPU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name,
      type: "B2C",
      contacts: {
        create: [
          {
            role: "CONTRACT_PARTY",
            scope: "CUSTOMER",
            isPrimary: false,
            name: "Test CP",
            phone1: `0900${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
            email: "cp@example.com",
            language: "vi",
          },
        ],
      },
    },
  });
  const equipment = await prisma.equipment.create({
    data: {
      customerId: customer.id,
      modelId,
      serialNumber: `SN-PU-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      ownership: "COMPANY",
      status: "ACTIVE",
    },
  });
  const req = new NextRequest("http://localhost/api/contracts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      type: "SALE",
      customerId: customer.id,
      equipment: [{ equipmentId: equipment.id, unitPrice: 5_000_000, quantity: 1 }],
      totalContractValue: 5_000_000,
    }),
  });
  const res = await contractsPost(req);
  const { body } = await readJson(res);
  const created = body.data as { id: string };
  createdContractDirs.add(created.id);
  return created.id;
}

describe("POST /api/contracts/[id]/pdf/upload", () => {
  it("MANAGER uploads a PDF → 200, pdfStorageKey + pdfUploadedAt set; GET returns the uploaded bytes", async () => {
    const contractId = await createContract("TEST_PDFUPLOAD_Manager");

    const form = new FormData();
    form.set("file", new Blob([MINIMAL_PDF], { type: "application/pdf" }), "signed.pdf");
    const uploadRes = await uploadRoute(
      multipartRequest(`/api/contracts/${contractId}/pdf/upload`, "POST", managerToken, form),
      { params: Promise.resolve({ id: contractId }) },
    );
    const { status, body } = await readJson(uploadRes);
    expect(status).toBe(200);

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    expect(contract?.pdfStorageKey).toBeTruthy();
    expect(contract?.pdfUploadedAt).toBeInstanceOf(Date);

    const getRes = await pdfGetRoute(
      new NextRequest(`http://localhost/api/contracts/${contractId}/pdf`, {
        headers: { authorization: `Bearer ${managerToken}` },
      }),
      { params: Promise.resolve({ id: contractId }) },
    );
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await getRes.arrayBuffer());
    expect(bytes.equals(MINIMAL_PDF)).toBe(true);
    void body;
  });

  it("STAFF upload → 403", async () => {
    const contractId = await createContract("TEST_PDFUPLOAD_Staff403");
    const form = new FormData();
    form.set("file", new Blob([MINIMAL_PDF], { type: "application/pdf" }), "signed.pdf");
    const res = await uploadRoute(
      multipartRequest(`/api/contracts/${contractId}/pdf/upload`, "POST", staffToken, form),
      { params: Promise.resolve({ id: contractId }) },
    );
    expect(res.status).toBe(403);
  });

  it("rejects a non-PDF file", async () => {
    const contractId = await createContract("TEST_PDFUPLOAD_BadType");
    const form = new FormData();
    form.set("file", new Blob([Buffer.from("not a pdf")], { type: "text/plain" }), "signed.txt");
    const res = await uploadRoute(
      multipartRequest(`/api/contracts/${contractId}/pdf/upload`, "POST", managerToken, form),
      { params: Promise.resolve({ id: contractId }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects a file over 10MB", async () => {
    const contractId = await createContract("TEST_PDFUPLOAD_TooBig");
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const form = new FormData();
    form.set("file", new Blob([big], { type: "application/pdf" }), "signed.pdf");
    const res = await uploadRoute(
      multipartRequest(`/api/contracts/${contractId}/pdf/upload`, "POST", managerToken, form),
      { params: Promise.resolve({ id: contractId }) },
    );
    expect(res.status).toBe(400);
  });

  it("GET falls through to the render path when there is no upload", async () => {
    const contractId = await createContract("TEST_PDFUPLOAD_NoUpload");
    const res = await pdfGetRoute(
      new NextRequest(`http://localhost/api/contracts/${contractId}/pdf`, {
        headers: { authorization: `Bearer ${managerToken}` },
      }),
      { params: Promise.resolve({ id: contractId }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(MINIMAL_PDF)).toBe(false);
  });
});
