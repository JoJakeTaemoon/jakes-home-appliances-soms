/**
 * Recommender unit test — mocks @/lib/prisma so we can control the wiring
 * of Customer.preferredTechnicianId, Site.region, and the per-tech load map.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    customer: { findUnique: vi.fn() },
    site: { findUnique: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    visit: { findFirst: vi.fn(), groupBy: vi.fn(), count: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { recommendTechnicians } from "@/lib/scheduler/recommend";

const ANY = expect.anything();

const scheduledFor = new Date("2026-06-15T14:00:00.000Z");

const techs = [
  { id: "u1", username: "tech1", phone: "0900000001", email: null, preferredRegion: "HCMC-D1" },
  { id: "u2", username: "tech2", phone: "0900000002", email: null, preferredRegion: "HCMC-D7" },
  { id: "u3", username: "tech3", phone: "0900000003", email: null, preferredRegion: "HCMC-D1" },
];

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(techs);
  (prisma.visit.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.visit.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.site.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

describe("recommendTechnicians", () => {
  it("returns empty when customer not found", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const out = await recommendTechnicians({
      customerId: "missing",
      scheduledFor,
    });
    expect(out).toEqual([]);
  });

  it("puts the preferred technician first when available", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      preferredTechnicianId: "u2",
      preferredRegion: "HCMC-D1",
    });
    const out = await recommendTechnicians({
      customerId: "c1",
      scheduledFor,
      maxResults: 3,
    });
    expect(out[0].technicianId).toBe("u2");
    expect(out[0].rationale).toBe("preferred");
    expect(out[0].isPreferred).toBe(true);
    expect(prisma.visit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadTechnicianId: "u2" }),
        select: ANY,
      }),
    );
  });

  it("skips preferred when busy and falls back to region match", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      preferredTechnicianId: "u2",
      preferredRegion: "HCMC-D1",
    });
    (prisma.visit.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "blocking-visit" });

    const out = await recommendTechnicians({
      customerId: "c1",
      scheduledFor,
      maxResults: 3,
    });
    // u2 not preferred anymore (busy); u1 and u3 region-match HCMC-D1 → first two
    expect(out[0].isPreferred).toBe(false);
    expect(out[0].regionMatch).toBe(true);
    expect(out[0].technicianId).toMatch(/^(u1|u3)$/);
    expect(out[1].regionMatch).toBe(true);
  });

  it("ranks region match above non-match in absence of preferred", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      preferredTechnicianId: null,
      preferredRegion: "HCMC-D7",
    });
    const out = await recommendTechnicians({
      customerId: "c1",
      scheduledFor,
      maxResults: 3,
    });
    // u2 has preferredRegion HCMC-D7 → first
    expect(out[0].technicianId).toBe("u2");
    expect(out[0].rationale).toBe("region_match");
  });

  it("uses site region (B2B) when present", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      preferredTechnicianId: null,
      preferredRegion: "HCMC-D1",
    });
    (prisma.site.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      customerId: "c1",
      region: "HCMC-D7",
    });
    const out = await recommendTechnicians({
      customerId: "c1",
      siteId: "s1",
      scheduledFor,
      maxResults: 3,
    });
    expect(out[0].technicianId).toBe("u2");
  });

  it("penalizes heavy daily load", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      preferredTechnicianId: null,
      preferredRegion: null,
    });
    (prisma.visit.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { leadTechnicianId: "u1", _count: { _all: 5 } },
      { leadTechnicianId: "u2", _count: { _all: 0 } },
    ]);
    const out = await recommendTechnicians({
      customerId: "c1",
      scheduledFor,
      maxResults: 3,
    });
    // u2 is least busy + region-irrelevant → first
    expect(out[0].technicianId).not.toBe("u1");
  });

  it("respects maxResults", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      preferredTechnicianId: null,
      preferredRegion: null,
    });
    const out = await recommendTechnicians({
      customerId: "c1",
      scheduledFor,
      maxResults: 2,
    });
    expect(out).toHaveLength(2);
  });
});
