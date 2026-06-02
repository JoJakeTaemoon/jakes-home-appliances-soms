/**
 * Unit tests for the `defineMutation` + `defineQuery` HOFs that back the
 * route layer (Refactor D). Mocks the auth guards + audit writer so the
 * tests stay realm-agnostic and never touch Prisma.
 *
 * The point of these tests is the *contract* of the HOF — the wire shape
 * (`{ success, data?, error? }`), the status codes, and the order of the
 * five phases (authn → authz → params → body → handler → audit). Anything
 * downstream (workflows, DB) is the caller's problem.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/api/error";

const requireAuthMock = vi.fn();
const requireCustomerAuthMock = vi.fn();
const logAuditMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
}));

vi.mock("@/lib/auth/customer-guards", () => ({
  requireCustomerAuth: (...args: unknown[]) => requireCustomerAuthMock(...args),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

// Import AFTER mocks so the HOF picks up our stubs.
import { defineMutation, defineQuery } from "@/lib/api/mutation";

function makeReq(
  url = "http://localhost/api/x",
  init?: { method?: string },
): NextRequest {
  return new NextRequest(url, init);
}

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

interface ApiResponseBody {
  success?: boolean;
  data?: unknown;
  pagination?: unknown;
  error: { code?: string; message?: string; issues?: Array<{ path: (string | number)[] }> };
}

async function readJson(res: Response): Promise<{ status: number; body: ApiResponseBody }> {
  return { status: res.status, body: (await res.json()) as ApiResponseBody };
}

describe("defineMutation", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireCustomerAuthMock.mockReset();
    logAuditMock.mockClear();
  });

  it("returns 200 + envelope on happy path", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });

    const handler = defineMutation({
      audience: "staff",
      body: z.object({ name: z.string() }),
      handler: async ({ body, auth }) => ({
        echo: body.name,
        actor: auth.userId,
      }),
    });

    const res = await handler(
      jsonReq("http://localhost/api/x", { name: "alice" }),
      { params: Promise.resolve({}) },
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { echo: "alice", actor: "u1" } });
  });

  it("returns 201 when successStatus=201", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "MANAGER" });
    const handler = defineMutation({
      audience: "staff",
      successStatus: 201,
      handler: async () => ({ created: true }),
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
  });

  it("propagates UnauthorizedError as 401", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError("no token"));
    const handler = defineMutation({
      audience: "staff",
      handler: async () => ({ ok: true }),
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when authorize throws ForbiddenError", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineMutation({
      audience: "staff",
      authorize: (auth) => {
        if (auth.role !== "MANAGER")
          throw new ForbiddenError("MANAGER required");
      },
      handler: async () => ({ ok: true }),
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    const { status, body } = await readJson(res);
    expect(status).toBe(403);
    expect(body.error.message).toBe("MANAGER required");
  });

  it("returns 400 with field issues when body fails Zod", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineMutation({
      audience: "staff",
      body: z.object({ amount: z.number().int() }),
      handler: async () => ({ ok: true }),
    });
    const res = await handler(
      jsonReq("http://localhost/api/x", { amount: "not-a-number" }),
      { params: Promise.resolve({}) },
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.issues?.[0]).toMatchObject({ path: ["amount"] });
  });

  it("returns 400 when params fail Zod", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineMutation({
      audience: "staff",
      params: z.object({ id: z.string().min(5) }),
      handler: async () => ({ ok: true }),
    });
    const res = await handler(makeReq(), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("writes an audit row after the handler succeeds", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineMutation({
      audience: "staff",
      body: z.object({ q: z.string() }),
      handler: async ({ body }) => ({ id: "row-1", value: body.q }),
      audit: {
        action: "DEMO_CREATE",
        entityType: "Demo",
        after: (r) => ({ value: r.value }),
      },
    });
    const res = await handler(
      jsonReq("http://localhost/api/x", { q: "hello" }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    const call = logAuditMock.mock.calls[0][0];
    expect(call).toMatchObject({
      actorType: "USER",
      actorId: "u1",
      action: "DEMO_CREATE",
      entityType: "Demo",
      entityId: "row-1",
      after: { value: "hello" },
    });
  });

  it("does NOT call audit when handler throws", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineMutation({
      audience: "staff",
      handler: async () => {
        throw new ValidationError("boom");
      },
      audit: { action: "X", entityType: "Demo" },
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("routes audience='customer' to requireCustomerAuth + actorType CUSTOMER", async () => {
    requireCustomerAuthMock.mockResolvedValue({
      contactId: "c1",
      customerId: "cust1",
      role: "CONTRACT_PARTY",
    });
    const handler = defineMutation({
      audience: "customer",
      handler: async ({ auth }) => ({ ok: true, contact: auth.contactId }),
      audit: { action: "PORTAL_X", entityType: "Demo" },
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(requireAuthMock).not.toHaveBeenCalled();
    expect(requireCustomerAuthMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      actorType: "CUSTOMER",
      actorId: "c1",
    });
  });

  it("treats undefined body as empty object — schemas using .partial() pass", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineMutation({
      audience: "staff",
      body: z.object({ reason: z.string().optional() }),
      handler: async ({ body }) => ({ reason: body.reason ?? null }),
    });
    // No body sent at all (request.json() will throw).
    const res = await handler(makeReq("http://localhost/api/x", { method: "POST" }), {
      params: Promise.resolve({}),
    });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toEqual({ reason: null });
  });
});

describe("defineQuery", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireCustomerAuthMock.mockReset();
    logAuditMock.mockClear();
  });

  it("returns the handler result wrapped in success envelope", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineQuery({
      audience: "staff",
      handler: async ({ auth }) => ({ items: [], me: auth.userId }),
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { items: [], me: "u1" },
    });
  });

  it("parses the query string when `query` schema provided", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineQuery({
      audience: "staff",
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        q: z.string().optional(),
      }),
      handler: async ({ query }) => ({ page: query.page, q: query.q ?? null }),
    });
    const res = await handler(
      makeReq("http://localhost/api/x?page=3&q=alice"),
      { params: Promise.resolve({}) },
    );
    const { body } = await readJson(res);
    expect(body.data).toEqual({ page: 3, q: "alice" });
  });

  it("returns 400 with field issues when query fails Zod", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineQuery({
      audience: "staff",
      query: z.object({ page: z.coerce.number().int().min(1) }),
      handler: async () => ({ ok: true }),
    });
    const res = await handler(
      makeReq("http://localhost/api/x?page=not-a-number"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });

  it("emits paginatedResponse shape when `paginated=true` + handler returns {rows, pagination}", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineQuery({
      audience: "staff",
      paginated: true,
      handler: async () => ({
        rows: [{ id: "a" }, { id: "b" }],
        pagination: { page: 1, limit: 10, total: 2 },
      }),
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: "a" }, { id: "b" }]);
    expect(body.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
      hasMore: false,
    });
  });

  it("propagates ForbiddenError from authorize with status 403", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
    const handler = defineQuery({
      audience: "staff",
      authorize: () => {
        throw new ForbiddenError("nope");
      },
      handler: async () => ({}),
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("uses customer realm when audience='customer'", async () => {
    requireCustomerAuthMock.mockResolvedValue({
      contactId: "c1",
      customerId: "cust1",
      role: "CONTRACT_PARTY",
    });
    const handler = defineQuery({
      audience: "customer",
      handler: async ({ auth }) => ({ me: auth.contactId }),
    });
    const res = await handler(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(requireCustomerAuthMock).toHaveBeenCalledTimes(1);
  });
});
