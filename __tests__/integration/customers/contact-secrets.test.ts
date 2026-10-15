/**
 * A portal contact's bcrypt hash must never leave the server — not in the
 * customer-detail response the office screen reads, not in the contact
 * update response, and not in the audit trail (MANAGER+ can read the
 * before/after of every row there).
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit"; // auto-mocked in __tests__/setup-node.ts
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { GET as customerGet } from "@/app/api/customers/[id]/route";
import { PATCH as contactPatch } from "@/app/api/customers/[id]/contacts/[contactId]/route";

const SECRET_HASH = "$2b$10$test.secret.hash.that.must.not.leak";
const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");

let staffId = "";
let token = "";
let customerId = "";
let contactId = "";

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: {
      username: `test_contact_secret_${rand()}`,
      phone: `0955${rand()}`,
      passwordHash: "x",
      role: "MANAGER",
    },
  });
  staffId = staff.id;
  token = await signStaffAccessToken({ userId: staff.id, username: staff.username, role: staff.role });
  const customer = await prisma.customer.create({
    data: { code: `TESTSEC-${rand()}`, name: "TEST_CONTACT_SECRET", type: "B2C" },
  });
  customerId = customer.id;
  const contact = await prisma.customerContact.create({
    data: {
      customerId,
      role: "OPS_CONTACT",
      scope: "CUSTOMER",
      isPrimary: true,
      name: "Portal User",
      phone1: `0944${rand()}`,
      email: "portal.user@example.com",
      language: "vi",
      portalEnabled: true,
      passwordHash: SECRET_HASH,
    },
  });
  contactId = contact.id;
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("contact password hash stays on the server", () => {
  it("GET /api/customers/:id omits passwordHash from contacts", async () => {
    const res = await customerGet(req(`/api/customers/${customerId}`, "GET"), {
      params: Promise.resolve({ id: customerId }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Portal User");
    expect(text).not.toContain(SECRET_HASH);
    expect(text).not.toContain("passwordHash");
  });

  it("PATCH contact keeps the hash out of the response and the audit row", async () => {
    vi.mocked(logAudit).mockClear();
    const res = await contactPatch(
      req(`/api/customers/${customerId}/contacts/${contactId}`, "PATCH", { title: "Office lead" }),
      { params: Promise.resolve({ id: customerId, contactId }) },
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Office lead");
    expect(text).not.toContain(SECRET_HASH);

    const audits = vi.mocked(logAudit).mock.calls.map(([a]) => a);
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain(SECRET_HASH);
  });
});
