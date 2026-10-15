/**
 * Opening a customer-portal account from the office.
 *
 *   - POST /api/customers/:id/contacts with `portalEnabled: true` used to
 *     generate a password and throw it away, so the new account could never
 *     log in. It must hand the one-time password back (and keep it out of the
 *     audit row).
 *   - POST /api/customers/:id/contacts/:contactId/enable-portal is the
 *     「포털 열기」 button on the customer detail 담당자 tab.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit"; // auto-mocked in __tests__/setup-node.ts
import { verifyPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { POST as contactsPost } from "@/app/api/customers/[id]/contacts/route";
import { POST as enablePortal } from "@/app/api/customers/[id]/contacts/[contactId]/enable-portal/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");

let staffId = "";
let staffToken = "";
let customerId = "";

function req(url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${staffToken}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function json(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as {
      success: boolean;
      data?: Record<string, unknown>;
      error?: { code?: string };
    },
  };
}

beforeAll(async () => {
  const staff = await prisma.user.create({
    data: {
      username: `test_portal_open_${rand()}`,
      phone: `0966${rand()}`,
      passwordHash: "x",
      role: "STAFF",
    },
  });
  staffId = staff.id;
  staffToken = await signStaffAccessToken({
    userId: staff.id,
    username: staff.username,
    role: staff.role,
  });
  const customer = await prisma.customer.create({
    data: { code: `TESTPO-${rand()}`, name: "TEST_PORTAL_OPEN", type: "B2C" },
  });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.user.deleteMany({ where: { id: staffId } });
});

describe("POST /api/customers/:id/contacts", () => {
  it("returns the one-time password when it opened the portal", async () => {
    const { status, body } = await json(
      await contactsPost(
        req(`/api/customers/${customerId}/contacts`, {
          role: "CONTRACT_PARTY",
          scope: "CUSTOMER",
          name: "Portal Opener",
          phone1: `0977${rand()}`,
          language: "vi",
          portalEnabled: true,
        }),
        { params: Promise.resolve({ id: customerId }) },
      ),
    );
    expect(status).toBe(201);
    const pw = body.data?.tempPassword;
    expect(typeof pw).toBe("string");
    expect((pw as string).length).toBe(10);
    expect(body.data?.portalEnabled).toBe(true);

    const row = await prisma.customerContact.findUniqueOrThrow({
      where: { id: body.data?.id as string },
      select: { portalEnabled: true, passwordHash: true, mustChangePassword: true },
    });
    expect(row.portalEnabled).toBe(true);
    expect(row.mustChangePassword).toBe(true);
    expect(await verifyPassword(pw as string, row.passwordHash!)).toBe(true);

    // The plaintext must never land in the audit trail.
    const audit = vi
      .mocked(logAudit)
      .mock.calls.map(([a]) => a)
      .find((a) => a.action === "CUSTOMER_CONTACT_CREATE" && a.entityId === body.data?.id);
    expect(audit).toBeDefined();
    expect(audit?.after).toMatchObject({ portalEnabled: true });
    expect(JSON.stringify(audit?.after)).not.toContain(pw as string);
    expect(audit?.after).not.toHaveProperty("tempPassword");
  });

  it("returns no password when the portal was not requested", async () => {
    const { status, body } = await json(
      await contactsPost(
        req(`/api/customers/${customerId}/contacts`, {
          role: "OPS_CONTACT",
          scope: "CUSTOMER",
          name: "No Portal",
          phone1: `0978${rand()}`,
          language: "vi",
        }),
        { params: Promise.resolve({ id: customerId }) },
      ),
    );
    expect(status).toBe(201);
    expect(body.data?.tempPassword).toBeUndefined();
    expect(body.data?.portalEnabled).toBe(false);
  });
});

describe("POST /api/customers/:id/contacts/:contactId/enable-portal", () => {
  it("opens the account once and refuses a second time", async () => {
    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        role: "OPS_CONTACT",
        scope: "CUSTOMER",
        name: "Later Portal",
        phone1: `0979${rand()}`,
        language: "ko",
      },
    });
    const url = `/api/customers/${customerId}/contacts/${contact.id}/enable-portal`;
    const ctx = { params: Promise.resolve({ id: customerId, contactId: contact.id }) };

    const first = await json(await enablePortal(req(url), ctx));
    expect(first.status).toBe(200);
    const pw = first.body.data?.tempPassword as string;
    expect(pw).toHaveLength(10);
    const row = await prisma.customerContact.findUniqueOrThrow({
      where: { id: contact.id },
      select: { portalEnabled: true, passwordHash: true },
    });
    expect(row.portalEnabled).toBe(true);
    expect(await verifyPassword(pw, row.passwordHash!)).toBe(true);

    const second = await json(
      await enablePortal(req(url), {
        params: Promise.resolve({ id: customerId, contactId: contact.id }),
      }),
    );
    expect(second.status).toBe(409);
  });
});
