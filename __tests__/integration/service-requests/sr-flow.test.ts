/**
 * Phase 5 — Service Request flow integration test.
 *
 *   - Portal submit free SR → auto-APPROVED + Visit created + receipt email
 *   - Portal submit paid SR → PENDING_REVIEW → manager approves → Visit
 *     created + SMS_SR_APPROVED + EMAIL_SR_APPROVED_DETAILS queued
 *   - Reject paid SR → REJECTED + SMS_SR_REJECTED queued
 *   - Customer cancel → CANCELLED + linked Visit cascaded to CANCELLED
 *   - Visit completion of a linked Visit transitions SR to COMPLETED
 *
 * Uses the real DB. The work-confirmation PDF renderer is mocked (same as
 * the Phase 4 visit-flow test) so this test stays fast + portable.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import {
  signCustomerAccessToken,
  signStaffAccessToken,
} from "@/lib/auth/jwt";

vi.mock("@/lib/pdf/renderer", async () => {
  const path = await import("node:path");
  const fsp = await import("node:fs/promises");
  return {
    renderPdf: async ({ kind, refId: visitId }: { kind: string; refId: string }) => {
      if (kind !== "WORK_CONFIRMATION") {
        throw new Error(`sr-flow.test mock: unexpected kind ${kind}`);
      }
      const dir = path.join(process.cwd(), "uploads", "visits", visitId);
      await fsp.mkdir(dir, { recursive: true });
      const filename = "work-confirmation.pdf";
      const fullPath = path.join(dir, filename);
      const stub = Buffer.from("%PDF-1.4 stub\n");
      await fsp.writeFile(fullPath, stub);
      const storageKey = path.relative(process.cwd(), fullPath);
      const doc = await (
        await import("@/lib/prisma")
      ).default.document.create({
        data: {
          kind: "WORK_CONFIRMATION",
          visitId,
          templateCode: "WORK_CONFIRMATION_B2C",
          locale: "vi",
          storageKey,
          filename,
          mimeType: "application/pdf",
          sizeBytes: stub.byteLength,
        },
      });
      return {
        storageKey,
        sizeBytes: stub.byteLength,
        documentId: doc.id,
        templateCode: "WORK_CONFIRMATION_B2C",
      };
    },
    getLatestPdf: async () => null,
  };
});

import { POST as portalSrPost, GET as portalSrGet } from "@/app/api/portal/service-requests/route";
import { GET as portalSrDetail } from "@/app/api/portal/service-requests/[id]/route";
import { POST as portalSrCancel } from "@/app/api/portal/service-requests/[id]/cancel/route";
import { GET as officeSrList } from "@/app/api/service-requests/route";
import { GET as officeSrDetail } from "@/app/api/service-requests/[id]/route";
import { POST as officeApprove } from "@/app/api/service-requests/[id]/approve/route";
import { POST as officeReject } from "@/app/api/service-requests/[id]/reject/route";
import { POST as officeCancel } from "@/app/api/service-requests/[id]/cancel/route";
import { POST as completeRoute } from "@/app/api/mobile/visits/[id]/complete/route";
import { POST as startRoute } from "@/app/api/mobile/visits/[id]/start/route";
import { POST as scheduleRoute } from "@/app/api/visits/[id]/schedule/route";

const TEST_CODE_PREFIX = "TESTKH5-";

let staffToken = "";
let managerToken = "";
let leadUserId = "";
let leadToken = "";

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

async function readJson(res: Response) {
  const status = res.status;
  const body = (await res.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
    pagination?: unknown;
  };
  return { status, body };
}

async function cleanup() {
  // Wipe customers + cascading rows.
  const customers = await prisma.customer.findMany({
    where: { code: { startsWith: TEST_CODE_PREFIX } },
    select: { id: true },
  });
  for (const c of customers) {
    const visitIds = (
      await prisma.visit.findMany({ where: { customerId: c.id }, select: { id: true } })
    ).map((v) => v.id);
    const srIds = (
      await prisma.serviceRequest.findMany({
        where: { customerId: c.id },
        select: { id: true },
      })
    ).map((s) => s.id);
    await prisma.payment.deleteMany({ where: { customerId: c.id } });
    await prisma.document.deleteMany({ where: { customerId: c.id } });
    await prisma.notificationLog.deleteMany({ where: { customerId: c.id } });
    await prisma.visit.deleteMany({ where: { id: { in: visitIds } } });
    await prisma.serviceRequest.deleteMany({ where: { id: { in: srIds } } });
    await prisma.contractEquipment.deleteMany({
      where: { equipment: { customerId: c.id } },
    });
    await prisma.equipment.deleteMany({ where: { customerId: c.id } });
    await prisma.contract.deleteMany({ where: { customerId: c.id } });
    await prisma.customerContact.deleteMany({ where: { customerId: c.id } });
    await prisma.customer.delete({ where: { id: c.id } });
  }
  for (const username of [
    "test_phase5_staff",
    "test_phase5_manager",
    "test_phase5_tech",
  ]) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET ??=
    "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??=
    "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";
  process.env.SMS_PROVIDER = "mock";
  process.env.EMAIL_PROVIDER = "mock";

  await cleanup();
  const pw = await hashPassword("Phase5-Test-123!");
  const staff = await prisma.user.create({
    data: {
      username: "test_phase5_staff",
      email: "test_phase5_staff@t.local",
      passwordHash: pw,
      role: "STAFF",
    },
  });
  const manager = await prisma.user.create({
    data: {
      username: "test_phase5_manager",
      email: "test_phase5_manager@t.local",
      passwordHash: pw,
      role: "MANAGER",
    },
  });
  const tech = await prisma.user.create({
    data: {
      username: "test_phase5_tech",
      phone: "0991100001",
      passwordHash: pw,
      role: "TECHNICIAN",
    },
  });
  leadUserId = tech.id;

  staffToken = await signStaffAccessToken({
    userId: staff.id,
    username: staff.username,
    role: staff.role,
  });
  managerToken = await signStaffAccessToken({
    userId: manager.id,
    username: manager.username,
    role: manager.role,
  });
  leadToken = await signStaffAccessToken({
    userId: tech.id,
    username: tech.username,
    role: tech.role,
  });
});

afterAll(async () => {
  await cleanup();
});

interface CustomerFixture {
  customerId: string;
  contactId: string;
  equipmentId: string;
  customerToken: string;
}

async function setupCustomer(opts: {
  installedDaysAgo: number;
  rental?: boolean;
}): Promise<CustomerFixture> {
  const pwHash = await hashPassword("PortalTest1!");
  const code = `${TEST_CODE_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const phone = `0993${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`;
  const customer = await prisma.customer.create({
    data: {
      code,
      name: "Phase5 Test Customer",
      type: "B2C",
      contacts: {
        create: {
          role: "CONTRACT_PARTY",
          scope: "CUSTOMER",
          isPrimary: false,
          name: "Phase5 Test CP",
          phone1: phone,
          email: `${code.toLowerCase()}@test.local`,
          language: "vi",
          portalEnabled: true,
          passwordHash: pwHash,
        },
      },
    },
    include: { contacts: true },
  });
  const contact = customer.contacts[0];

  const model = await prisma.equipmentModel.upsert({
    where: { modelCode: "TEST-PHASE5-MODEL" },
    update: {},
    create: {
      modelCode: "TEST-PHASE5-MODEL",
      name: "Phase5 Test Model",
      category: "WATER_PURIFIER",
    },
  });

  const installedAt = new Date(
    Date.now() - opts.installedDaysAgo * 24 * 60 * 60 * 1000,
  );
  const equipment = await prisma.equipment.create({
    data: {
      customerId: customer.id,
      modelId: model.id,
      ownership: opts.rental ? "COMPANY" : "CUSTOMER",
      status: "ACTIVE",
      installedAt,
    },
  });

  if (opts.rental) {
    const contract = await prisma.contract.create({
      data: {
        contractNumber: `HD-TEST-${code}`,
        customerId: customer.id,
        type: "RENTAL",
        state: "ACTIVE",
        activatedAt: installedAt,
        startDate: installedAt,
      },
    });
    await prisma.contractEquipment.create({
      data: { contractId: contract.id, equipmentId: equipment.id },
    });
  }

  const customerToken = await signCustomerAccessToken({
    contactId: contact.id,
    customerId: customer.id,
    contactRole: contact.role,
  });

  return {
    customerId: customer.id,
    contactId: contact.id,
    equipmentId: equipment.id,
    customerToken,
  };
}

describe("Portal POST /api/portal/service-requests — free SR auto-approval", () => {
  it("auto-approves an INSPECTION on rental equipment and creates a Visit", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 200, rental: true });

    const res = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "INSPECTION",
        description: "Please check the unit, it makes noise.",
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    const data = body.data as {
      serviceRequestId: string;
      state: string;
      isPaid: boolean;
      visitId: string | null;
      code: string;
    };
    expect(data.state).toBe("APPROVED");
    expect(data.isPaid).toBe(false);
    expect(data.visitId).not.toBeNull();
    expect(data.code).toMatch(/^SR-\d{5}$/);

    const linked = await prisma.visit.findUnique({
      where: { id: data.visitId! },
      select: { serviceRequestId: true, state: true, type: true },
    });
    expect(linked?.serviceRequestId).toBe(data.serviceRequestId);
    expect(linked?.type).toBe("PERIODIC_INSPECTION");

    // EMAIL_SR_RECEIVED queued
    const logs = await prisma.notificationLog.findMany({
      where: { customerId: fx.customerId, templateCode: "EMAIL_SR_RECEIVED" },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("rejects equipmentId from a different customer", async () => {
    const a = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const b = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const res = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", a.customerToken, {
        equipmentId: b.equipmentId,
        type: "INSPECTION",
        description: "Sneaky cross-customer access attempt.",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("requires a 10-char description", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const res = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "INSPECTION",
        description: "short",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("Portal POST /api/portal/service-requests — paid SR + office approval", () => {
  it("submits a paid REPAIR (out of warranty, sale-only) and manager approves it", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 400, rental: false });

    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "REPAIR",
        description: "Pump stopped working after 1 year",
      }),
    );
    const created = (await createRes.json()).data as {
      serviceRequestId: string;
      state: string;
      isPaid: boolean;
      visitId: string | null;
    };
    expect(createRes.status).toBe(201);
    expect(created.state).toBe("PENDING_REVIEW");
    expect(created.isPaid).toBe(true);
    expect(created.visitId).toBeNull();

    // Office sees it in the pending queue
    const listRes = await officeSrList(
      await buildReq(
        "/api/service-requests?state=PENDING_REVIEW&pageSize=10",
        "GET",
        staffToken,
      ),
    );
    const listBody = await listRes.json();
    expect(
      (listBody.data as { id: string }[]).some(
        (r) => r.id === created.serviceRequestId,
      ),
    ).toBe(true);

    // Manager approves with price + date + tech
    const approvedDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const approveRes = await officeApprove(
      await buildReq(
        `/api/service-requests/${created.serviceRequestId}/approve`,
        "POST",
        managerToken,
        {
          approvedPrice: 750000,
          approvedDate: approvedDate.toISOString(),
          scheduledFor: approvedDate.toISOString(),
          leadTechnicianId: leadUserId,
          notes: "Repair pump assembly",
        },
      ),
      { params: Promise.resolve({ id: created.serviceRequestId }) },
    );
    const { status: aStatus, body: aBody } = await readJson(approveRes);
    expect(aStatus).toBe(200);
    const aData = aBody.data as { visitId: string; state: string };
    expect(aData.state).toBe("SCHEDULED");

    const visit = await prisma.visit.findUnique({
      where: { id: aData.visitId },
      select: {
        state: true,
        leadTechnicianId: true,
        expectedAmount: true,
        serviceRequestId: true,
      },
    });
    expect(visit?.state).toBe("SCHEDULED");
    expect(visit?.leadTechnicianId).toBe(leadUserId);
    expect(visit?.serviceRequestId).toBe(created.serviceRequestId);

    // SMS_SR_APPROVED queued (mock provider)
    const smsLogs = await prisma.notificationLog.findMany({
      where: {
        customerId: fx.customerId,
        templateCode: "SMS_SR_APPROVED",
      },
    });
    expect(smsLogs.length).toBeGreaterThan(0);
  });

  it("returns 403 when STAFF tries to approve (MANAGER+ only)", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 400, rental: false });
    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "REPAIR",
        description: "Need repair; not under warranty",
      }),
    );
    const created = (await createRes.json()).data as { serviceRequestId: string };
    const approveRes = await officeApprove(
      await buildReq(
        `/api/service-requests/${created.serviceRequestId}/approve`,
        "POST",
        staffToken,
        {
          approvedPrice: 100000,
          approvedDate: new Date().toISOString(),
        },
      ),
      { params: Promise.resolve({ id: created.serviceRequestId }) },
    );
    expect(approveRes.status).toBe(403);
  });
});

describe("Reject", () => {
  it("STAFF can reject a PENDING_REVIEW SR and SMS_SR_REJECTED is queued", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 400, rental: false });
    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "OTHER",
        description: "Asking about something out of scope",
      }),
    );
    const created = (await createRes.json()).data as { serviceRequestId: string };

    const rej = await officeReject(
      await buildReq(
        `/api/service-requests/${created.serviceRequestId}/reject`,
        "POST",
        staffToken,
        {
          reason: "Out of scope",
          customerMessage: "This service isn't offered.",
        },
      ),
      { params: Promise.resolve({ id: created.serviceRequestId }) },
    );
    expect(rej.status).toBe(200);

    const refreshed = await prisma.serviceRequest.findUnique({
      where: { id: created.serviceRequestId },
      select: { state: true, rejectionReason: true },
    });
    expect(refreshed?.state).toBe("REJECTED");
    expect(refreshed?.rejectionReason).toBe("Out of scope");

    const logs = await prisma.notificationLog.findMany({
      where: { customerId: fx.customerId, templateCode: "SMS_SR_REJECTED" },
    });
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe("Customer cancel cascades to Visit", () => {
  it("cancels a free SR (APPROVED) and the auto-created Visit transitions to CANCELLED", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "INSPECTION",
        description: "Routine check please.",
      }),
    );
    const created = (await createRes.json()).data as {
      serviceRequestId: string;
      visitId: string | null;
    };
    expect(created.visitId).not.toBeNull();

    const cancelRes = await portalSrCancel(
      await buildReq(
        `/api/portal/service-requests/${created.serviceRequestId}/cancel`,
        "POST",
        fx.customerToken,
        { reason: "Changed my mind" },
      ),
      { params: Promise.resolve({ id: created.serviceRequestId }) },
    );
    expect(cancelRes.status).toBe(200);

    const sr = await prisma.serviceRequest.findUnique({
      where: { id: created.serviceRequestId },
      select: { state: true },
    });
    expect(sr?.state).toBe("CANCELLED");

    const visit = await prisma.visit.findUnique({
      where: { id: created.visitId! },
      select: { state: true },
    });
    expect(visit?.state).toBe("CANCELLED");
  });
});

describe("Visit completion drags linked SR to COMPLETED", () => {
  it("completes the Visit and the linked SR transitions to COMPLETED", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "INSPECTION",
        description: "Routine inspection.",
      }),
    );
    const created = (await createRes.json()).data as {
      serviceRequestId: string;
      visitId: string | null;
    };

    // Office schedules the auto-Visit
    await scheduleRoute(
      await buildReq(
        `/api/visits/${created.visitId!}/schedule`,
        "POST",
        managerToken,
        { leadTechnicianId: leadUserId, collaboratorTechnicianIds: [] },
      ),
      { params: Promise.resolve({ id: created.visitId! }) },
    );

    // SR should now be SCHEDULED via the linkage hook
    const srAfterSchedule = await prisma.serviceRequest.findUnique({
      where: { id: created.serviceRequestId },
      select: { state: true },
    });
    expect(srAfterSchedule?.state).toBe("SCHEDULED");

    // Lead starts the visit, completes it
    await startRoute(
      await buildReq(
        `/api/mobile/visits/${created.visitId!}/start`,
        "POST",
        leadToken,
      ),
      { params: Promise.resolve({ id: created.visitId! }) },
    );
    const complete = await completeRoute(
      await buildReq(
        `/api/mobile/visits/${created.visitId!}/complete`,
        "POST",
        leadToken,
        {
          findings: "Inspection complete; unit healthy.",
          partsReplaced: [],
          photos: [],
          customerSignaturePhotoStorageKey: "uploads/visits/sig.jpg",
        },
      ),
      { params: Promise.resolve({ id: created.visitId! }) },
    );
    expect(complete.status).toBe(200);

    const finalSr = await prisma.serviceRequest.findUnique({
      where: { id: created.serviceRequestId },
      select: { state: true },
    });
    expect(finalSr?.state).toBe("COMPLETED");
  });
});

describe("Portal GET /api/portal/service-requests", () => {
  it("lists only the caller's SRs", async () => {
    const a = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const b = await setupCustomer({ installedDaysAgo: 200, rental: true });

    await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", a.customerToken, {
        equipmentId: a.equipmentId,
        type: "INSPECTION",
        description: "Customer A request",
      }),
    );
    await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", b.customerToken, {
        equipmentId: b.equipmentId,
        type: "INSPECTION",
        description: "Customer B request",
      }),
    );

    const listA = await portalSrGet(
      await buildReq("/api/portal/service-requests", "GET", a.customerToken),
    );
    const bodyA = await listA.json();
    expect(listA.status).toBe(200);
    const rowsA = bodyA.data as { customerId: string }[];
    expect(rowsA.length).toBeGreaterThan(0);
    expect(rowsA.every((r) => r.customerId === a.customerId)).toBe(true);
  });
});

describe("Portal GET /api/portal/service-requests/[id]", () => {
  it("404s a cross-customer access", async () => {
    const a = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const b = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", a.customerToken, {
        equipmentId: a.equipmentId,
        type: "INSPECTION",
        description: "A's request",
      }),
    );
    const createdId = (await createRes.json()).data.serviceRequestId as string;
    const peek = await portalSrDetail(
      await buildReq(
        `/api/portal/service-requests/${createdId}`,
        "GET",
        b.customerToken,
      ),
      { params: Promise.resolve({ id: createdId }) },
    );
    expect(peek.status).toBe(404);
  });
});

describe("Office cancel", () => {
  it("allows STAFF to cancel a PENDING_REVIEW SR", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 400, rental: false });
    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "REPAIR",
        description: "Paid repair request",
      }),
    );
    const createdId = (await createRes.json()).data.serviceRequestId as string;
    const cancel = await officeCancel(
      await buildReq(
        `/api/service-requests/${createdId}/cancel`,
        "POST",
        staffToken,
        { reason: "Duplicate request" },
      ),
      { params: Promise.resolve({ id: createdId }) },
    );
    expect(cancel.status).toBe(200);
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: createdId },
      select: { state: true },
    });
    expect(sr?.state).toBe("CANCELLED");
  });
});

describe("Office detail", () => {
  it("returns the SR + customer + equipment + activity audit", async () => {
    const fx = await setupCustomer({ installedDaysAgo: 200, rental: true });
    const createRes = await portalSrPost(
      await buildReq("/api/portal/service-requests", "POST", fx.customerToken, {
        equipmentId: fx.equipmentId,
        type: "INSPECTION",
        description: "Office-detail test SR",
      }),
    );
    const createdId = (await createRes.json()).data.serviceRequestId as string;

    const detail = await officeSrDetail(
      await buildReq(
        `/api/service-requests/${createdId}`,
        "GET",
        staffToken,
      ),
      { params: Promise.resolve({ id: createdId }) },
    );
    expect(detail.status).toBe(200);
    const body = await detail.json();
    expect(body.data.customer.code).toMatch(new RegExp(`^${TEST_CODE_PREFIX}`));
    expect(Array.isArray(body.data.activity)).toBe(true);
  });
});
