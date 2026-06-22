/**
 * Integration test for Customer API:
 *   - create B2C / B2B
 *   - list + search + filter
 *   - deactivate + reactivate cascades
 *   - B2C cannot have sites (400); B2B can
 *   - equipment install + replace + relocate
 *
 * Hits the route handlers directly with hand-built NextRequests, no running
 * server. Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { GET as customersGet, POST as customersPost } from "@/app/api/customers/route";
import { GET as customerGet, PATCH as customerPatch } from "@/app/api/customers/[id]/route";
import { POST as deactivateRoute } from "@/app/api/customers/[id]/deactivate/route";
import { POST as reactivateRoute } from "@/app/api/customers/[id]/reactivate/route";
import { POST as sitesPost } from "@/app/api/customers/[id]/sites/route";
import { POST as equipmentPost } from "@/app/api/equipment/route";
import { POST as equipmentReplace } from "@/app/api/equipment/[id]/replace/route";
import { POST as equipmentMoveSite } from "@/app/api/equipment/[id]/move-site/route";

const ADMIN_USERNAME = "test_phase2_admin";
const STAFF_USERNAME = "test_phase2_staff";
const MANAGER_USERNAME = "test_phase2_manager";
const ADMIN_PHONE = "9333300001";
const STAFF_PHONE = "9333300002";
const MANAGER_PHONE = "9333300003";

let adminToken = "";
let staffToken = "";
let managerToken = "";
let modelId = "";

async function buildReq(url: string, method: string, token: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function readJson(res: Response): Promise<{ status: number; body: { success: boolean; data?: unknown; error?: { code?: string; message?: string }; pagination?: unknown } }> {
  const status = res.status;
  const body = (await res.json()) as { success: boolean; data?: unknown; error?: { code?: string; message?: string }; pagination?: unknown };
  return { status, body };
}

async function cleanupTestData() {
  // Delete any test customers created by this suite (and cascade equipment/sites/contacts)
  await prisma.customer.deleteMany({
    where: {
      OR: [
        { code: { startsWith: "TESTKH-" } },
        { name: { startsWith: "TEST_PHASE2_" } },
      ],
    },
  });
  await prisma.equipmentModel.deleteMany({ where: { modelCode: "TEST-PHASE2-MODEL" } });
  for (const phone of [ADMIN_PHONE, STAFF_PHONE, MANAGER_PHONE]) {
    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "TEST_PHASE2_" } } });
}

beforeAll(async () => {
  process.env.JWT_SECRET ??=
    "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??=
    "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";

  await cleanupTestData();

  const pw = await hashPassword("Phase2-Test-123!");
  const admin = await prisma.user.create({
    data: { username: ADMIN_USERNAME, phone: ADMIN_PHONE, email: `${ADMIN_USERNAME}@t.local`, passwordHash: pw, role: "ADMIN" },
  });
  const staff = await prisma.user.create({
    data: { username: STAFF_USERNAME, phone: STAFF_PHONE, email: `${STAFF_USERNAME}@t.local`, passwordHash: pw, role: "STAFF" },
  });
  const manager = await prisma.user.create({
    data: { username: MANAGER_USERNAME, phone: MANAGER_PHONE, email: `${MANAGER_USERNAME}@t.local`, passwordHash: pw, role: "MANAGER" },
  });
  adminToken = await signStaffAccessToken({ userId: admin.id, username: admin.username, role: admin.role });
  staffToken = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  managerToken = await signStaffAccessToken({ userId: manager.id, username: manager.username, role: manager.role });

  const model = await prisma.equipmentModel.upsert({
    where: { modelCode: "TEST-PHASE2-MODEL" },
    update: {},
    create: {
      modelCode: "TEST-PHASE2-MODEL",
      nameKo: "Phase 2 test model",
      nameVi: "Phase 2 test model",
      nameEn: "Phase 2 test model",
      category: "WATER_PURIFIER",
    },
  });
  modelId = model.id;
});

afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/customers (B2C)", () => {
  it("creates a B2C customer with auto-allocated KH code", async () => {
    // B2C since 2026-06: customer IS the contract party — phone/email/language
    // live on the customer top-level, not in a contractParty object.
    const req = await buildReq("/api/customers", "POST", adminToken, {
      type: "B2C",
      name: "TEST_PHASE2_B2C_Alpha",
      phone: "0900000100",
      language: "vi",
      opsContacts: [],
    });
    const res = await customersPost(req);
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    const data = body.data as { id: string; code: string; type: string };
    expect(data.code).toMatch(/^KH\d{5}$/);
    expect(data.type).toBe("B2C");
  });

  it("rejects creates without a customer phone", async () => {
    const req = await buildReq("/api/customers", "POST", adminToken, {
      type: "B2C",
      name: "TEST_PHASE2_invalid",
      language: "vi",
      opsContacts: [],
    });
    const res = await customersPost(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/customers (B2B)", () => {
  it("creates a B2B customer with site afterwards", async () => {
    const create = await buildReq("/api/customers", "POST", adminToken, {
      type: "B2B",
      name: "TEST_PHASE2_B2B_Bravo Co",
      shortcode: "TPB",
      taxCode: "0399999988",
      contractParty: {
        name: "Trần Bravo",
        phone1: "0900000200",
        language: "vi",
      },
      opsContacts: [
        { name: "Lê Ops", phone1: "0900000201", language: "vi", isPrimary: true },
      ],
    });
    const res = await customersPost(create);
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const created = body.data as { id: string };

    // Now add a site.
    const siteRes = await sitesPost(
      await buildReq(`/api/customers/${created.id}/sites`, "POST", adminToken, {
        name: "TPB HQ",
        addressStreet: "1 Test St",
        addressProvinceName: "HCMC",
        region: "HCMC-D1",
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    const sj = await readJson(siteRes);
    expect(sj.status).toBe(201);
  });

  it("refuses site creation on B2C customer (400)", async () => {
    // Create a B2C
    const create = await customersPost(
      await buildReq("/api/customers", "POST", adminToken, {
        type: "B2C",
        name: "TEST_PHASE2_NoSites",
        phone: "0900000300",
        language: "vi",
        opsContacts: [],
      }),
    );
    const { body: cb } = await readJson(create);
    const id = (cb.data as { id: string }).id;
    const res = await sitesPost(
      await buildReq(`/api/customers/${id}/sites`, "POST", adminToken, {
        name: "Should fail",
        addressStreet: "X",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects duplicate B2B shortcode", async () => {
    await customersPost(
      await buildReq("/api/customers", "POST", adminToken, {
        type: "B2B",
        name: "TEST_PHASE2_Dup1",
        shortcode: "TPD",
        taxCode: "0399999900",
        contractParty: { name: "A", phone1: "0900000400", language: "vi" },
        opsContacts: [{ name: "B", phone1: "0900000401", language: "vi" }],
      }),
    );
    const dup = await customersPost(
      await buildReq("/api/customers", "POST", adminToken, {
        type: "B2B",
        name: "TEST_PHASE2_Dup2",
        shortcode: "TPD",
        taxCode: "0399999901",
        contractParty: { name: "A", phone1: "0900000402", language: "vi" },
        opsContacts: [{ name: "B", phone1: "0900000403", language: "vi" }],
      }),
    );
    expect(dup.status).toBe(409);
  });
});

describe("GET /api/customers", () => {
  it("returns paginated list filterable by type + search", async () => {
    const req = await buildReq("/api/customers?type=B2B&q=TEST_PHASE2", "GET", adminToken);
    const res = await customersGet(req);
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const rows = body.data as { name: string; type: string }[];
    for (const r of rows) {
      expect(r.type).toBe("B2B");
      expect(r.name).toContain("TEST_PHASE2");
    }
  });

  it("respects pagination meta", async () => {
    const req = await buildReq("/api/customers?pageSize=1", "GET", adminToken);
    const res = await customersGet(req);
    const { body } = await readJson(res);
    const data = body.data as unknown[];
    const pag = body.pagination as { total: number; page: number; limit: number };
    expect(data.length).toBeLessThanOrEqual(1);
    expect(pag.page).toBe(1);
    expect(pag.limit).toBe(1);
  });
});

describe("Customer deactivate / reactivate", () => {
  let cId = "";
  let eqId = "";

  beforeEach(async () => {
    // Fresh customer for each test
    const created = await customersPost(
      await buildReq("/api/customers", "POST", adminToken, {
        type: "B2C",
        name: `TEST_PHASE2_DeactTarget_${Date.now()}`,
        phone: "0900000500",
        language: "vi",
        opsContacts: [],
      }),
    );
    const { body } = await readJson(created);
    cId = (body.data as { id: string }).id;
    // Add equipment so we can check cascade.
    const eqRes = await equipmentPost(
      await buildReq("/api/equipment", "POST", adminToken, {
        customerId: cId,
        modelId,
        serialNumber: `SN-${Date.now()}`,
      }),
    );
    const { body: ej } = await readJson(eqRes);
    eqId = (ej.data as { id: string }).id;
  });

  it("STAFF cannot deactivate (403)", async () => {
    const res = await deactivateRoute(
      await buildReq(`/api/customers/${cId}/deactivate`, "POST", staffToken, {
        reason: "test",
      }),
      { params: Promise.resolve({ id: cId }) },
    );
    expect(res.status).toBe(403);
  });

  it("MANAGER deactivates + cascades equipment to DEACTIVATED", async () => {
    const res = await deactivateRoute(
      await buildReq(`/api/customers/${cId}/deactivate`, "POST", managerToken, {
        reason: "test cascade",
      }),
      { params: Promise.resolve({ id: cId }) },
    );
    expect(res.status).toBe(200);

    const equipment = await prisma.equipment.findUnique({ where: { id: eqId } });
    expect(equipment?.status).toBe("DEACTIVATED");

    const customer = await prisma.customer.findUnique({ where: { id: cId } });
    expect(customer?.status).toBe("INACTIVE");
    expect(customer?.deactivationReason).toBe("test cascade");
  });

  it("MANAGER cannot reactivate (403)", async () => {
    await deactivateRoute(
      await buildReq(`/api/customers/${cId}/deactivate`, "POST", managerToken, {
        reason: "test",
      }),
      { params: Promise.resolve({ id: cId }) },
    );
    const res = await reactivateRoute(
      await buildReq(`/api/customers/${cId}/reactivate`, "POST", managerToken),
      { params: Promise.resolve({ id: cId }) },
    );
    expect(res.status).toBe(403);
  });

  it("ADMIN can reactivate", async () => {
    await deactivateRoute(
      await buildReq(`/api/customers/${cId}/deactivate`, "POST", managerToken, {
        reason: "test",
      }),
      { params: Promise.resolve({ id: cId }) },
    );
    const res = await reactivateRoute(
      await buildReq(`/api/customers/${cId}/reactivate`, "POST", adminToken),
      { params: Promise.resolve({ id: cId }) },
    );
    expect(res.status).toBe(200);
    const customer = await prisma.customer.findUnique({ where: { id: cId } });
    expect(customer?.status).toBe("ACTIVE");
    expect(customer?.deactivationReason).toBeNull();
  });
});

describe("PATCH /api/customers/[id]", () => {
  it("updates basic fields and audits the change", async () => {
    const created = await customersPost(
      await buildReq("/api/customers", "POST", adminToken, {
        type: "B2C",
        name: "TEST_PHASE2_PatchTarget",
        phone: "0900000700",
        language: "vi",
        opsContacts: [],
      }),
    );
    const { body } = await readJson(created);
    const id = (body.data as { id: string }).id;

    const patchRes = await customerPatch(
      await buildReq(`/api/customers/${id}`, "PATCH", adminToken, {
        name: "TEST_PHASE2_PatchTarget renamed",
        preferredRegion: "HCMC-D7",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(patchRes.status).toBe(200);
    const customer = await prisma.customer.findUnique({ where: { id } });
    expect(customer?.name).toBe("TEST_PHASE2_PatchTarget renamed");
    expect(customer?.preferredRegion).toBe("HCMC-D7");
  });
});

describe("GET /api/customers/[id]", () => {
  it("returns NotFound for unknown id", async () => {
    const res = await customerGet(
      await buildReq("/api/customers/nonexistent", "GET", adminToken),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("Equipment install + replace + relocate", () => {
  it("installs, replaces (old=REPLACED, new=ACTIVE), and relocates between sites", async () => {
    // Create B2B customer + 2 sites
    const created = await customersPost(
      await buildReq("/api/customers", "POST", adminToken, {
        type: "B2B",
        name: "TEST_PHASE2_EqFlow",
        shortcode: "TPE",
        taxCode: "0399999777",
        contractParty: { name: "X", phone1: "0900000800", language: "vi" },
        opsContacts: [{ name: "Y", phone1: "0900000801", language: "vi" }],
      }),
    );
    const { body } = await readJson(created);
    const cId = (body.data as { id: string }).id;
    const s1Res = await sitesPost(
      await buildReq(`/api/customers/${cId}/sites`, "POST", adminToken, {
        name: "Site 1",
        addressStreet: "Addr 1",
      }),
      { params: Promise.resolve({ id: cId }) },
    );
    const s2Res = await sitesPost(
      await buildReq(`/api/customers/${cId}/sites`, "POST", adminToken, {
        name: "Site 2",
        addressStreet: "Addr 2",
      }),
      { params: Promise.resolve({ id: cId }) },
    );
    const s1 = ((await s1Res.json()) as { data: { id: string } }).data.id;
    const s2 = ((await s2Res.json()) as { data: { id: string } }).data.id;

    // Install equipment on site 1.
    const installRes = await equipmentPost(
      await buildReq("/api/equipment", "POST", adminToken, {
        customerId: cId,
        siteId: s1,
        modelId,
        serialNumber: "TPE-001",
      }),
    );
    expect(installRes.status).toBe(201);
    const { data: installed } = (await installRes.json()) as { data: { id: string } };

    // Relocate to site 2.
    const relRes = await equipmentMoveSite(
      await buildReq(`/api/equipment/${installed.id}/move-site`, "POST", adminToken, {
        siteId: s2,
        reason: "test relocate",
      }),
      { params: Promise.resolve({ id: installed.id }) },
    );
    expect(relRes.status).toBe(200);
    const eqAfterMove = await prisma.equipment.findUnique({ where: { id: installed.id } });
    expect(eqAfterMove?.siteId).toBe(s2);

    // Replace with a new unit (same model, different serial).
    const replRes = await equipmentReplace(
      await buildReq(`/api/equipment/${installed.id}/replace`, "POST", adminToken, {
        newModelId: modelId,
        newSerialNumber: "TPE-001-NEW",
        reason: "test replace",
      }),
      { params: Promise.resolve({ id: installed.id }) },
    );
    expect(replRes.status).toBe(201);
    const replBody = (await replRes.json()) as {
      data: { old: { id: string; status: string }; new: { id: string; status: string } };
    };
    expect(replBody.data.old.status).toBe("REPLACED");
    expect(replBody.data.new.status).toBe("ACTIVE");
    expect(replBody.data.new.id).not.toBe(replBody.data.old.id);
  });
});
