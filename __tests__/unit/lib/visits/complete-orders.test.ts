/**
 * Completing a visit that carries CONSUMABLE_DELIVERY (as its primary type or
 * an additional one) hands the goods over, so the orders linked to that visit
 * move PENDING → DELIVERED (with the stock decrement). Other visit types leave
 * orders alone, and a failure here must not bounce the technician's completion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { visit, deliverPendingOrdersForVisit } = vi.hoisted(() => ({
  visit: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  deliverPendingOrdersForVisit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: { visit, user: { findUnique: vi.fn() }, equipment: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/notifications/send", () => ({ sendNotification: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/pdf/renderer", () => ({
  renderPdf: vi.fn().mockResolvedValue({ storageKey: "uploads/v1/wc.pdf", documentId: "doc-1" }),
}));
vi.mock("@/lib/payments/operations", () => ({ recordCashCollection: vi.fn() }));
vi.mock("@/lib/service-requests/operations", () => ({ completeSrFromVisit: vi.fn() }));
vi.mock("@/lib/orders/delivery", () => ({
  deliverPendingOrdersForVisit: (...a: unknown[]) => deliverPendingOrdersForVisit(...a),
}));

import { completeVisit } from "@/lib/visits/complete";

function seedVisit(type: string, additionalTypes: string[] = []) {
  visit.findUnique.mockResolvedValue({
    id: "v1",
    state: "IN_PROGRESS",
    type,
    additionalTypes,
    leadTechnicianId: "tech-1",
    customerId: "c1",
    siteId: null,
    equipmentId: null,
    expectedAmount: null,
    customer: { id: "c1", name: "Acme", contacts: [] },
    serviceRequest: null,
  });
  visit.update.mockResolvedValue({ id: "v1", state: "COMPLETED", completedAt: new Date() });
}

const run = () =>
  completeVisit({
    visitId: "v1",
    actorUserId: "tech-1",
    locale: "vi",
    input: {
      findings: "Delivered filters",
      partsReplaced: [],
      photos: [],
      customerSignaturePhotoStorageKey: "sig.png",
    } as never,
  });

beforeEach(() => {
  vi.clearAllMocks();
  deliverPendingOrdersForVisit.mockResolvedValue(["ord-1"]);
});

describe("completeVisit → linked orders", () => {
  it("delivers the visit's orders when CONSUMABLE_DELIVERY is the primary type", async () => {
    seedVisit("CONSUMABLE_DELIVERY");
    await run();
    expect(deliverPendingOrdersForVisit).toHaveBeenCalledWith("v1", "tech-1");
  });

  it("does the same when CONSUMABLE_DELIVERY rides along as an additional type", async () => {
    seedVisit("PERIODIC_INSPECTION", ["CONSUMABLE_DELIVERY"]);
    await run();
    expect(deliverPendingOrdersForVisit).toHaveBeenCalledWith("v1", "tech-1");
  });

  it("leaves orders alone on other visit types", async () => {
    seedVisit("REPAIR");
    await run();
    expect(deliverPendingOrdersForVisit).not.toHaveBeenCalled();
  });

  it("still completes the visit if marking orders delivered fails", async () => {
    seedVisit("CONSUMABLE_DELIVERY");
    deliverPendingOrdersForVisit.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await run();
    expect(out.visitId).toBe("v1");
    spy.mockRestore();
  });
});
