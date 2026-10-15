/**
 * GET /api/visits/print-bundle/pdf — the merged batch-print PDF used to
 * render only the primary visit type's document, so a periodic inspection
 * that also delivers consumables lost its sale receipt. It must render the
 * same per-visit list as the HTML preview (primary + additionalTypes).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

const { visitFindMany, buildPreviewElement } = vi.hoisted(() => ({
  visitFindMany: vi.fn(),
  buildPreviewElement: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn().mockResolvedValue({ userId: "u1", role: "STAFF" }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    visit: { findMany: (a: unknown) => visitFindMany(a) },
    contract: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/pdf/fonts", () => ({ registerFonts: vi.fn() }));
vi.mock("@/lib/pdf/renderer", () => ({ renderPdf: vi.fn(), getLatestPdf: vi.fn() }));
vi.mock("@/lib/pdf/visit-preview", () => ({
  buildPreviewElement: (...a: unknown[]) => buildPreviewElement(...a),
}));
// One blank A4 page per rendered document.
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: async () => {
    const d = await PDFDocument.create();
    d.addPage([595, 842]);
    return Buffer.from(await d.save());
  },
}));

import { GET } from "@/app/api/visits/print-bundle/pdf/route";

beforeEach(() => {
  vi.clearAllMocks();
  buildPreviewElement.mockResolvedValue({});
});

describe("print-bundle merged PDF", () => {
  it("renders every suggested document kind, additional types included", async () => {
    visitFindMany.mockResolvedValue([
      {
        id: "v1",
        type: "PERIODIC_INSPECTION",
        additionalTypes: ["CONSUMABLE_DELIVERY", "PERIODIC_INSPECTION"],
        scheduledFor: new Date("2026-10-15T02:00:00Z"),
        customerId: "c1",
        customer: { type: "B2C" },
      },
    ]);

    const res = await GET(
      new NextRequest(
        "http://localhost/api/visits/print-bundle/pdf?date=2026-10-15&technicianId=t1",
      ),
    );

    expect(res.status).toBe(200);
    // additionalTypes must be loaded for the expansion to happen at all.
    expect(visitFindMany.mock.calls[0][0].select.additionalTypes).toBe(true);
    const kinds = buildPreviewElement.mock.calls.map((c) => c[1]);
    // Same deduped list the HTML preview shows.
    expect(kinds).toEqual(["PERIODIC_CHECK_B2C", "SALE_RECEIPT_B2C"]);
    const merged = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(merged.getPageCount()).toBe(2);
  });
});
