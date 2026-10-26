/**
 * 고객 삭제 — hard delete with a per-group choice for everything attached:
 *   operations (equipment · contracts · visits · payments)
 *   contacts   (contacts · sites)
 *   requests   (service requests · orders)
 *   records    (notification logs · documents)
 * Each group moves to one target customer or goes with the customer.
 * MANAGER+, and the customer's code must be typed back to confirm.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { logAudit } from "@/lib/audit";
import { GET as preview } from "@/app/api/customers/[id]/delete-preview/route";
import { POST as del } from "@/app/api/customers/[id]/delete/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const P = "TEST_CDEL_";
let manager = "";
let staff = "";
const userIds: string[] = [];

const req = (url: string, method: string, token: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seed(name: string) {
  const r = rand();
  const c = await prisma.customer.create({ data: { code: `${P}${r}`, name: `${P}${name}`, type: "B2B", shortcode: `X${r.slice(0, 5)}` } });
  const site = await prisma.site.create({ data: { customerId: c.id, name: `${name} 공장` } });
  await prisma.customerContact.create({ data: { customerId: c.id, role: "CONTRACT_PARTY", name: `${name} 대표`, phone1: `09${r}01` } });
  await prisma.customerContact.create({ data: { customerId: c.id, role: "OPS_CONTACT", name: `${name} 담당`, phone1: `09${r}02`, isPrimary: true } });
  const eq = await prisma.equipment.create({
    data: { customerId: c.id, siteId: site.id, assetCode: `TCDEL-${r}`, customDescription: "x", status: "ACTIVE", installedAt: new Date("2025-01-01") },
  });
  await prisma.equipmentConsumable.create({ data: { equipmentId: eq.id, customName: "필터", replaceEveryDays: 90 } });
  const k = await prisma.contract.create({ data: { contractNumber: `${P}HD-${r}`, customerId: c.id, type: "RENTAL", equipment: { create: [{ equipmentId: eq.id }] } } });
  const visit = await prisma.visit.create({ data: { customerId: c.id, type: "INSTALLATION", scheduledFor: new Date(), equipmentId: eq.id, contractId: k.id, siteId: site.id } });
  await prisma.payment.create({ data: { customerId: c.id, method: "CASH", expectedAmount: 100000, contractId: k.id, visitId: visit.id } });
  await prisma.serviceRequest.create({ data: { code: `${P}${r}`, customerId: c.id, type: "REPAIR", description: "x", equipmentId: eq.id } });
  await prisma.order.create({ data: { orderNumber: `${P}OR-${r}`, customerId: c.id, orderedAt: new Date() } });
  await prisma.notificationLog.create({ data: { customerId: c.id, templateCode: "SMS_VISIT_REMINDER", channel: "SMS", locale: "vi", provider: "mock", recipient: "0900000000" } });
  await prisma.document.create({ data: { customerId: c.id, kind: "CONTRACT", templateCode: "x", storageKey: `test/${r}`, filename: "x.pdf" } });
  return { ...c, siteId: site.id, equipmentId: eq.id };
}

const countFor = async (customerId: string) => ({
  equipment: await prisma.equipment.count({ where: { customerId } }),
  contracts: await prisma.contract.count({ where: { customerId } }),
  visits: await prisma.visit.count({ where: { customerId } }),
  payments: await prisma.payment.count({ where: { customerId } }),
  contacts: await prisma.customerContact.count({ where: { customerId } }),
  sites: await prisma.site.count({ where: { customerId } }),
  serviceRequests: await prisma.serviceRequest.count({ where: { customerId } }),
  orders: await prisma.order.count({ where: { customerId } }),
  notificationLogs: await prisma.notificationLog.count({ where: { customerId } }),
  documents: await prisma.document.count({ where: { customerId } }),
});
const ALL_DELETE = { operations: "DELETE", contacts: "DELETE", requests: "DELETE", records: "DELETE" };

beforeAll(async () => {
  for (const role of ["MANAGER", "STAFF"] as const) {
    const u = await prisma.user.create({ data: { username: `test_cdel_${role}_${rand()}`, phone: `0955${rand()}`, passwordHash: "x", role } });
    userIds.push(u.id);
    const t = await signStaffAccessToken({ userId: u.id, username: u.username, role });
    if (role === "MANAGER") manager = t;
    else staff = t;
  }
});

afterAll(async () => {
  const ids = (await prisma.customer.findMany({ where: { code: { startsWith: P } }, select: { id: true } })).map((c) => c.id);
  await prisma.payment.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.contract.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.notificationLog.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.document.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("고객 삭제", () => {
  it("previews what is attached, by group", async () => {
    const c = await seed("Preview");
    const res = await preview(req(`/api/customers/${c.id}/delete-preview`, "GET", manager), ctx(c.id));
    expect(res.status).toBe(200);
    const d = ((await res.json()) as { data: Record<string, unknown> }).data;
    expect(d).toMatchObject({
      customer: { code: c.code },
      groups: {
        operations: { equipment: 1, contracts: 1, visits: 1, payments: 1 },
        contacts: { contacts: 2, sites: 1 },
        requests: { serviceRequests: 1, orders: 1 },
        records: { notificationLogs: 1, documents: 1 },
      },
    });
  });

  it("is MANAGER+ only", async () => {
    const c = await seed("Staff");
    const res = await del(req(`/api/customers/${c.id}/delete`, "POST", staff, { actions: ALL_DELETE, confirmCode: c.code }), ctx(c.id));
    expect(res.status).toBe(403);
    expect(await prisma.customer.count({ where: { id: c.id } })).toBe(1);
  });

  it("refuses without the customer's code typed back", async () => {
    const c = await seed("NoCode");
    const res = await del(req(`/api/customers/${c.id}/delete`, "POST", manager, { actions: ALL_DELETE, confirmCode: "nope" }), ctx(c.id));
    expect(res.status).toBe(400);
    expect(await prisma.customer.count({ where: { id: c.id } })).toBe(1);
  });

  it("refuses to move without a target customer", async () => {
    const c = await seed("NoTarget");
    const res = await del(
      req(`/api/customers/${c.id}/delete`, "POST", manager, { actions: { ...ALL_DELETE, operations: "MOVE" }, confirmCode: c.code }),
      ctx(c.id),
    );
    expect(res.status).toBe(400);
  });

  it("deletes the customer and everything attached when every group is DELETE", async () => {
    const c = await seed("All");
    const res = await del(req(`/api/customers/${c.id}/delete`, "POST", manager, { actions: ALL_DELETE, confirmCode: c.code }), ctx(c.id));
    expect(res.status).toBe(200);
    expect(await prisma.customer.count({ where: { id: c.id } })).toBe(0);
    expect(Object.values(await countFor(c.id)).every((n) => n === 0)).toBe(true);
    expect(await prisma.equipment.count({ where: { id: c.equipmentId } })).toBe(0);
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CUSTOMER_DELETE", entityType: "Customer", entityId: c.id }),
    );
  });

  it("moves the chosen groups to the target and deletes the rest", async () => {
    const c = await seed("Mix");
    const target = await seed("Target");
    const res = await del(
      req(`/api/customers/${c.id}/delete`, "POST", manager, {
        actions: { operations: "MOVE", contacts: "MOVE", requests: "DELETE", records: "DELETE" },
        targetCustomerId: target.id,
        confirmCode: c.code,
      }),
      ctx(c.id),
    );
    expect(res.status).toBe(200);
    expect(await prisma.customer.count({ where: { id: c.id } })).toBe(0);
    const t = await countFor(target.id);
    expect(t).toMatchObject({ equipment: 2, contracts: 2, visits: 2, payments: 2, contacts: 4, sites: 2, serviceRequests: 1, orders: 1, notificationLogs: 1, documents: 1 });
    // The moved unit still sits at its (moved) site.
    expect((await prisma.equipment.findUnique({ where: { id: c.equipmentId } }))?.siteId).toBe(c.siteId);
    // The target keeps one contract party and one primary operations contact.
    const contacts = await prisma.customerContact.findMany({ where: { customerId: target.id } });
    expect(contacts.filter((x) => x.role === "CONTRACT_PARTY")).toHaveLength(1);
    expect(contacts.filter((x) => x.role === "OPS_CONTACT" && x.isPrimary)).toHaveLength(1);
  });

  it("moving the equipment but deleting the sites leaves the moved unit without a site", async () => {
    const c = await seed("SiteGone");
    const target = await seed("Target2");
    const res = await del(
      req(`/api/customers/${c.id}/delete`, "POST", manager, {
        actions: { operations: "MOVE", contacts: "DELETE", requests: "DELETE", records: "DELETE" },
        targetCustomerId: target.id,
        confirmCode: c.code,
      }),
      ctx(c.id),
    );
    expect(res.status).toBe(200);
    const unit = await prisma.equipment.findUnique({ where: { id: c.equipmentId } });
    expect(unit?.customerId).toBe(target.id);
    expect(unit?.siteId).toBeNull();
  });
});
