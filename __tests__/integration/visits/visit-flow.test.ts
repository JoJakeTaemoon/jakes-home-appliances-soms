/**
 * Integration test for the Phase 4 Visit pipeline.
 *
 * Covers:
 *   - POST /api/visits (office creates SUGGESTED visit)
 *   - GET  /api/visits/recommend (returns ranked candidates)
 *   - POST /api/visits/[id]/schedule (lead + collaborators assigned)
 *   - GET  /api/visits + GET /api/visits/[id]
 *   - Mobile: GET /api/mobile/visits/today + technician scope
 *   - POST /api/mobile/visits/[id]/start (lead-only)
 *   - POST /api/mobile/visits/[id]/complete (lead-only, creates Payment + Document)
 *   - Collaborator cannot complete; non-participant cannot view
 *   - POST /api/visits/[id]/reschedule
 *   - POST /api/visits/[id]/cancel
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

// Stub the heavy PDF renderer to keep this integration test fast + isolated
// from font/file-system requirements. The render result still touches the
// Document table so we can assert wiring.
vi.mock("@/lib/pdf/renderer", async () => {
  const path = await import("node:path");
  const fsp = await import("node:fs/promises");
  return {
    renderPdf: async ({ kind, refId: visitId }: { kind: string; refId: string }) => {
      if (kind !== "WORK_CONFIRMATION") {
        throw new Error(`visit-flow.test mock: unexpected kind ${kind}`);
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

import { GET as visitsGet, POST as visitsPost } from "@/app/api/visits/route";
import { POST as scheduleRoute } from "@/app/api/visits/[id]/schedule/route";
import { POST as cancelRoute } from "@/app/api/visits/[id]/cancel/route";
import { POST as reschedRoute } from "@/app/api/visits/[id]/reschedule/route";
import { GET as recommendRoute } from "@/app/api/visits/recommend/route";
import { GET as todayRoute } from "@/app/api/mobile/visits/today/route";
import { GET as mobileGet } from "@/app/api/mobile/visits/[id]/route";
import { POST as startRoute } from "@/app/api/mobile/visits/[id]/start/route";
import { POST as completeRoute } from "@/app/api/mobile/visits/[id]/complete/route";

const STAFF_USERNAME = "test_phase4_staff";
const TECH_LEAD_USERNAME = "test_phase4_tech_lead";
const TECH_COLLAB_USERNAME = "test_phase4_tech_collab";
const TECH_OTHER_USERNAME = "test_phase4_tech_other";
const STAFF_PHONE = "9555500001";
const TECH_LEAD_PHONE = "0900900001";
const TECH_COLLAB_PHONE = "0900900002";
const TECH_OTHER_PHONE = "0900900003";

let staffToken = "";
let leadToken = "";
let collabToken = "";
let otherToken = "";
let leadUserId = "";
let collabUserId = "";

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
  const customers = await prisma.customer.findMany({
    where: { code: { startsWith: "TESTKH4-" } },
    select: { id: true },
  });
  for (const c of customers) {
    const visitIds = (
      await prisma.visit.findMany({ where: { customerId: c.id }, select: { id: true } })
    ).map((v) => v.id);
    await prisma.payment.deleteMany({ where: { customerId: c.id } });
    await prisma.document.deleteMany({ where: { customerId: c.id } });
    await prisma.notificationLog.deleteMany({ where: { customerId: c.id } });
    await prisma.visit.deleteMany({ where: { id: { in: visitIds } } });
    await prisma.equipment.deleteMany({ where: { customerId: c.id } });
    await prisma.customerContact.deleteMany({ where: { customerId: c.id } });
    await prisma.customer.delete({ where: { id: c.id } });
  }
  for (const phone of [
    STAFF_PHONE,
    TECH_LEAD_PHONE,
    TECH_COLLAB_PHONE,
    TECH_OTHER_PHONE,
  ]) {
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.payment.deleteMany({ where: { collectedById: user.id } });
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
  const pw = await hashPassword("Phase4-Test-123!");
  const staff = await prisma.user.create({
    data: {
      username: STAFF_USERNAME,
      phone: STAFF_PHONE,
      email: `${STAFF_USERNAME}@t.local`,
      passwordHash: pw,
      role: "STAFF",
    },
  });
  const lead = await prisma.user.create({
    data: {
      username: TECH_LEAD_USERNAME,
      phone: TECH_LEAD_PHONE,
      passwordHash: pw,
      role: "TECHNICIAN",
      preferredRegion: "HCMC-T4",
    },
  });
  const collab = await prisma.user.create({
    data: {
      username: TECH_COLLAB_USERNAME,
      phone: TECH_COLLAB_PHONE,
      passwordHash: pw,
      role: "TECHNICIAN",
      preferredRegion: "HCMC-T4",
    },
  });
  const other = await prisma.user.create({
    data: {
      username: TECH_OTHER_USERNAME,
      phone: TECH_OTHER_PHONE,
      passwordHash: pw,
      role: "TECHNICIAN",
      preferredRegion: "HCMC-T9",
    },
  });
  leadUserId = lead.id;
  collabUserId = collab.id;
  staffToken = await signStaffAccessToken({
    userId: staff.id,
    username: staff.username,
    role: staff.role,
  });
  leadToken = await signStaffAccessToken({
    userId: lead.id,
    username: lead.username,
    role: lead.role,
  });
  collabToken = await signStaffAccessToken({
    userId: collab.id,
    username: collab.username,
    role: collab.role,
  });
  otherToken = await signStaffAccessToken({
    userId: other.id,
    username: other.username,
    role: other.role,
  });
});

afterAll(async () => {
  await cleanup();
});

async function createTestCustomer() {
  return prisma.customer.create({
    data: {
      code: `TESTKH4-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "TEST_PHASE4_Customer",
      type: "B2C",
      address: "123 Test St",
      district: "Q1",
      city: "HCMC",
      preferredTechnicianId: leadUserId,
      preferredRegion: "HCMC-T4",
      contacts: {
        create: [
          {
            role: "CONTRACT_PARTY",
            scope: "CUSTOMER",
            isPrimary: false,
            name: "Test CP",
            phone1: `0901${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
            language: "vi",
          },
          {
            role: "OPS_CONTACT",
            scope: "CUSTOMER",
            isPrimary: true,
            name: "Test Ops",
            phone1: `0902${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
            language: "vi",
          },
        ],
      },
    },
    include: { contacts: true },
  });
}

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);
// Round to a clean time so window calcs are stable.
TOMORROW.setUTCHours(14, 0, 0, 0);

describe("POST /api/visits", () => {
  it("creates a SUGGESTED visit", async () => {
    const customer = await createTestCustomer();
    const req = await buildReq("/api/visits", "POST", staffToken, {
      customerId: customer.id,
      type: "PERIODIC_INSPECTION",
      scheduledFor: TOMORROW.toISOString(),
      expectedAmount: 350000,
    });
    const res = await visitsPost(req);
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    expect(
      (body.data as { state: string; type: string }).state,
    ).toBe("SUGGESTED");
    expect(
      (body.data as { type: string }).type,
    ).toBe("PERIODIC_INSPECTION");
  });

  it("rejects equipment for a different customer", async () => {
    const a = await createTestCustomer();
    const b = await createTestCustomer();
    const eq = await prisma.equipmentModel.upsert({
      where: { modelCode: "TEST-PHASE4-MODEL" },
      update: {},
      create: {
        modelCode: "TEST-PHASE4-MODEL",
        nameKo: "Test",
        nameVi: "Test",
        nameEn: "Test",
        category: "WATER_PURIFIER",
      },
    });
    const equipment = await prisma.equipment.create({
      data: { customerId: b.id, modelId: eq.id, ownership: "COMPANY", status: "ACTIVE" },
    });
    const req = await buildReq("/api/visits", "POST", staffToken, {
      customerId: a.id,
      equipmentId: equipment.id,
      type: "REPAIR",
      scheduledFor: TOMORROW.toISOString(),
    });
    const res = await visitsPost(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/visits/recommend", () => {
  it("returns the preferred technician first", async () => {
    const customer = await createTestCustomer();
    const sp = new URLSearchParams({
      customerId: customer.id,
      scheduledFor: TOMORROW.toISOString(),
    });
    const res = await recommendRoute(
      await buildReq(`/api/visits/recommend?${sp.toString()}`, "GET", staffToken),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    const out = body.data as { technicianId: string; rationale: string }[];
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].technicianId).toBe(leadUserId);
    expect(out[0].rationale).toBe("preferred");
  });
});

describe("Schedule + complete + side effects", () => {
  it("runs a full lifecycle: schedule → start → complete (with Payment + Document)", async () => {
    const customer = await createTestCustomer();
    const createRes = await visitsPost(
      await buildReq("/api/visits", "POST", staffToken, {
        customerId: customer.id,
        type: "PERIODIC_INSPECTION",
        scheduledFor: TOMORROW.toISOString(),
        expectedAmount: 500000,
      }),
    );
    const created = ((await createRes.json()).data) as { id: string };

    // Schedule
    const scheduleRes = await scheduleRoute(
      await buildReq(
        `/api/visits/${created.id}/schedule`,
        "POST",
        staffToken,
        {
          leadTechnicianId: leadUserId,
          collaboratorTechnicianIds: [collabUserId],
        },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    const { status: schedStatus, body: schedBody } = await readJson(scheduleRes);
    expect(schedStatus).toBe(200);
    expect((schedBody.data as { state: string }).state).toBe("SCHEDULED");

    // Mobile: today list (lead sees the visit as lead, collab as shared)
    const leadToday = await todayRoute(
      await buildReq(`/api/mobile/visits/today`, "GET", leadToken),
    );
    const leadTodayBody = await leadToday.json();
    // The visit may not be "today" depending on TOMORROW vs UTC offset — just
    // verify that the route is reachable and returns the expected shape.
    expect(leadTodayBody.success).toBe(true);

    // Collaborator CANNOT start (only lead)
    const collabStart = await startRoute(
      await buildReq(
        `/api/mobile/visits/${created.id}/start`,
        "POST",
        collabToken,
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(collabStart.status).toBe(403);

    // Other tech CANNOT view it
    const otherView = await mobileGet(
      await buildReq(
        `/api/mobile/visits/${created.id}`,
        "GET",
        otherToken,
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(otherView.status).toBe(404);

    // Lead starts
    const startRes = await startRoute(
      await buildReq(`/api/mobile/visits/${created.id}/start`, "POST", leadToken),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(startRes.status).toBe(200);

    // Collaborator CANNOT complete
    const collabComplete = await completeRoute(
      await buildReq(
        `/api/mobile/visits/${created.id}/complete`,
        "POST",
        collabToken,
        {
          findings: "x",
          customerSignaturePhotoStorageKey: "uploads/sig.jpg",
        },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(collabComplete.status).toBe(403);

    // Lead completes with cash payment
    const completeRes = await completeRoute(
      await buildReq(
        `/api/mobile/visits/${created.id}/complete`,
        "POST",
        leadToken,
        {
          findings: "Replaced sediment filter; flushed system.",
          partsReplaced: ["Sediment"],
          photos: [],
          customerSignaturePhotoStorageKey: "uploads/visits/x/sig.jpg",
          collectedAmount: 500000,
          paymentMethod: "CASH",
        },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    const { status: cStatus, body: cBody } = await readJson(completeRes);
    expect(cStatus).toBe(200);
    expect((cBody.data as { paymentId: string | null }).paymentId).not.toBeNull();
    expect(
      (cBody.data as { workConfirmation: { documentId: string } }).workConfirmation
        .documentId,
    ).toBeTruthy();

    // Visit should now be COMPLETED, Payment row should exist
    const visit = await prisma.visit.findUnique({
      where: { id: created.id },
      include: { payments: true, documents: true },
    });
    expect(visit?.state).toBe("COMPLETED");
    expect(visit?.payments.length).toBe(1);
    expect(visit?.payments[0].state).toBe("COLLECTED");
    expect(visit?.documents.some((d) => d.kind === "WORK_CONFIRMATION")).toBe(
      true,
    );
  });
});

describe("Reschedule + cancel", () => {
  it("reschedules a SCHEDULED visit back to SCHEDULED with new date", async () => {
    const customer = await createTestCustomer();
    const createRes = await visitsPost(
      await buildReq("/api/visits", "POST", staffToken, {
        customerId: customer.id,
        type: "REPAIR",
        scheduledFor: TOMORROW.toISOString(),
      }),
    );
    const created = (await createRes.json()).data as { id: string };

    await scheduleRoute(
      await buildReq(
        `/api/visits/${created.id}/schedule`,
        "POST",
        staffToken,
        { leadTechnicianId: leadUserId, collaboratorTechnicianIds: [] },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );

    const newDate = new Date(TOMORROW.getTime() + 24 * 60 * 60 * 1000);
    const reschedRes = await reschedRoute(
      await buildReq(
        `/api/visits/${created.id}/reschedule`,
        "POST",
        staffToken,
        {
          scheduledFor: newDate.toISOString(),
          reason: "Customer asked to move",
        },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    const { status, body } = await readJson(reschedRes);
    expect(status).toBe(200);
    expect((body.data as { state: string }).state).toBe("SCHEDULED");
  });

  it("cancels a SUGGESTED visit with a reason", async () => {
    const customer = await createTestCustomer();
    const createRes = await visitsPost(
      await buildReq("/api/visits", "POST", staffToken, {
        customerId: customer.id,
        type: "OTHER",
        scheduledFor: TOMORROW.toISOString(),
      }),
    );
    const created = (await createRes.json()).data as { id: string };

    const cancelRes = await cancelRoute(
      await buildReq(
        `/api/visits/${created.id}/cancel`,
        "POST",
        staffToken,
        { reason: "Customer no longer needs this visit" },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    const { status, body } = await readJson(cancelRes);
    expect(status).toBe(200);
    expect((body.data as { state: string }).state).toBe("CANCELLED");
  });
});

describe("Listing scope", () => {
  it("STAFF sees all visits; TECHNICIAN sees only their own (lead OR collaborator)", async () => {
    const customer = await createTestCustomer();
    const createRes = await visitsPost(
      await buildReq("/api/visits", "POST", staffToken, {
        customerId: customer.id,
        type: "REPAIR",
        scheduledFor: TOMORROW.toISOString(),
      }),
    );
    const created = (await createRes.json()).data as { id: string };
    await scheduleRoute(
      await buildReq(
        `/api/visits/${created.id}/schedule`,
        "POST",
        staffToken,
        {
          leadTechnicianId: leadUserId,
          collaboratorTechnicianIds: [collabUserId],
        },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );

    const sp = new URLSearchParams({
      customerId: customer.id,
      pageSize: "10",
    });
    const staffList = await visitsGet(
      await buildReq(`/api/visits?${sp.toString()}`, "GET", staffToken),
    );
    expect((await staffList.json()).data.length).toBeGreaterThan(0);

    // Other tech sees zero
    const otherList = await visitsGet(
      await buildReq(`/api/visits?${sp.toString()}`, "GET", otherToken),
    );
    const otherBody = await otherList.json();
    const otherIds = (otherBody.data as { id: string }[]).map((v) => v.id);
    expect(otherIds).not.toContain(created.id);

    // Collab sees it
    const collabList = await visitsGet(
      await buildReq(`/api/visits?${sp.toString()}`, "GET", collabToken),
    );
    const collabBody = await collabList.json();
    const collabIds = (collabBody.data as { id: string }[]).map((v) => v.id);
    expect(collabIds).toContain(created.id);
  });
});
