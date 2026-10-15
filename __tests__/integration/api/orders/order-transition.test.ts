/**
 * PATCH /api/orders/[id] — the only way an order leaves PENDING from the
 * office. STAFF+ only; body is the target state (DELIVERED | CANCELLED).
 * The state move itself (stock, audit) is covered in
 * __tests__/unit/lib/orders/delivery.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { requireAuthMock, transitionOrder } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  transitionOrder: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireAuth: (req: NextRequest) => requireAuthMock(req),
}));
vi.mock("@/lib/orders/delivery", () => ({
  transitionOrder: (a: unknown) => transitionOrder(a),
}));
vi.mock("@/lib/prisma", () => ({ default: {} }));

import { PATCH } from "@/app/api/orders/[id]/route";

async function call(body: unknown) {
  const req = new NextRequest("http://localhost/api/orders/ord-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const res = await PATCH(req, { params: Promise.resolve({ id: "ord-1" }) });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: "u1", role: "STAFF" });
  transitionOrder.mockResolvedValue({ id: "ord-1", state: "DELIVERED" });
});

describe("PATCH /api/orders/[id]", () => {
  it("marks an order delivered for STAFF", async () => {
    const { status, body } = await call({ state: "DELIVERED" });
    expect(status).toBe(200);
    expect(body.data.state).toBe("DELIVERED");
    expect(transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ord-1", to: "DELIVERED", actorId: "u1" }),
    );
  });

  it("cancels an order", async () => {
    transitionOrder.mockResolvedValueOnce({ id: "ord-1", state: "CANCELLED" });
    const { status } = await call({ state: "CANCELLED" });
    expect(status).toBe(200);
    expect(transitionOrder).toHaveBeenCalledWith(expect.objectContaining({ to: "CANCELLED" }));
  });

  it("refuses technicians", async () => {
    requireAuthMock.mockResolvedValueOnce({ userId: "t1", role: "TECHNICIAN" });
    const { status } = await call({ state: "DELIVERED" });
    expect(status).toBe(403);
    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it("rejects moving back to PENDING or any other value", async () => {
    for (const state of ["PENDING", "SHIPPED", undefined]) {
      const { status } = await call({ state });
      expect(status).toBe(400);
    }
    expect(transitionOrder).not.toHaveBeenCalled();
  });
});
