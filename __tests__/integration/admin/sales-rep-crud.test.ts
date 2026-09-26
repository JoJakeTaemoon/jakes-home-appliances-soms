/**
 * 판매원 master — CRUD + the rank gate, and what a retired rep does to the
 * customers already pointing at them.
 *
 * Uses the real DB — DATABASE_URL must point at dev.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";

import { POST as repsPost, GET as repsGet } from "@/app/api/sales-reps/route";
import {
  PATCH as repPatch,
  DELETE as repDelete,
} from "@/app/api/sales-reps/[id]/route";

const STAFF_PHONE = "9322280001";
const MANAGER_PHONE = "9322280002";
const REP_NAME = "테스트 판매원 김";
const CUSTOMER_CODE = "KH-SALESREP-TEST";

let staffToken = "";
let managerToken = "";
let repId = "";
let customerId = "";

function req(url: string, method: string, token: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as { success: boolean; data?: Record<string, unknown> },
  };
}

async function cleanup() {
  await prisma.customer.deleteMany({ where: { code: CUSTOMER_CODE } });
  await prisma.salesRep.deleteMany({ where: { name: { startsWith: REP_NAME } } });
  for (const phone of [STAFF_PHONE, MANAGER_PHONE]) {
    const u = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (u) {
      await prisma.auditLog.deleteMany({ where: { actorId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??= "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";
  await cleanup();
  const pw = await hashPassword("SalesRep-Test-123!");
  const staff = await prisma.user.create({
    data: { username: "test_salesrep_staff", phone: STAFF_PHONE, passwordHash: pw, role: "STAFF" },
  });
  const manager = await prisma.user.create({
    data: { username: "test_salesrep_mgr", phone: MANAGER_PHONE, passwordHash: pw, role: "MANAGER" },
  });
  staffToken = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  managerToken = await signStaffAccessToken({ userId: manager.id, username: manager.username, role: manager.role });
});

afterAll(cleanup);

describe("판매원 master", () => {
  it("lets any office role add a rep — the customer form needs it inline", async () => {
    const res = await repsPost(
      req("/api/sales-reps", "POST", staffToken, {
        name: REP_NAME,
        phone: "0912345678",
        title: "영업 사원",
      }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    repId = body.data!.id as string;
    expect(body.data!.isActive).toBe(true);
  });

  it("refuses to edit or retire below MANAGER", async () => {
    const patched = await repPatch(
      req(`/api/sales-reps/${repId}`, "PATCH", staffToken, { name: `${REP_NAME} 수정` }),
      { params: Promise.resolve({ id: repId }) },
    );
    expect(patched.status).toBe(403);

    const deleted = await repDelete(
      req(`/api/sales-reps/${repId}`, "DELETE", staffToken),
      { params: Promise.resolve({ id: repId }) },
    );
    expect(deleted.status).toBe(403);
  });

  it("lets a MANAGER edit", async () => {
    const res = await repPatch(
      req(`/api/sales-reps/${repId}`, "PATCH", managerToken, { title: "영업팀장" }),
      { params: Promise.resolve({ id: repId }) },
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data!.title).toBe("영업팀장");
  });

  it("keeps a retired rep on the customers who already name them", async () => {
    const customer = await prisma.customer.create({
      data: { code: CUSTOMER_CODE, type: "B2C", name: "판매원 테스트 고객", salesRepId: repId },
      select: { id: true },
    });
    customerId = customer.id;

    const res = await repDelete(
      req(`/api/sales-reps/${repId}`, "DELETE", managerToken),
      { params: Promise.resolve({ id: repId }) },
    );
    expect(res.status).toBe(200);

    // Soft: the row survives and the customer still points at it.
    const after = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { salesRepId: true },
    });
    expect(after?.salesRepId).toBe(repId);
    const rep = await prisma.salesRep.findUnique({ where: { id: repId } });
    expect(rep?.isActive).toBe(false);
  });

  it("drops a retired rep from the picker but not from the roster screen", async () => {
    const active = await readJson(await repsGet(req("/api/sales-reps", "GET", staffToken)));
    const activeIds = (active.body.data as unknown as { id: string }[]).map((r) => r.id);
    expect(activeIds).not.toContain(repId);

    const all = await readJson(
      await repsGet(req("/api/sales-reps?includeInactive=true", "GET", staffToken)),
    );
    const allIds = (all.body.data as unknown as { id: string }[]).map((r) => r.id);
    expect(allIds).toContain(repId);
  });
});
