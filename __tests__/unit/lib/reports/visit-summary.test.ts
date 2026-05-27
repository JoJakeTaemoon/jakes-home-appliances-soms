/**
 * Daily visit summary unit test.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { visit: { findMany: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { getDailyVisitSummary } from "@/lib/reports/visit-summary";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDailyVisitSummary", () => {
  it("returns zeroed buckets when no visits", async () => {
    (prisma.visit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const out = await getDailyVisitSummary(new Date("2026-05-27"));
    expect(out.total).toBe(0);
    expect(out.completed).toBe(0);
    expect(out.byTechnician).toEqual([]);
  });

  it("buckets by state and groups per lead technician", async () => {
    (prisma.visit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        state: "COMPLETED",
        leadTechnician: { id: "u1", username: "tech1" },
        leadTechnicianId: "u1",
      },
      {
        state: "COMPLETED",
        leadTechnician: { id: "u1", username: "tech1" },
        leadTechnicianId: "u1",
      },
      {
        state: "SCHEDULED",
        leadTechnician: { id: "u2", username: "tech2" },
        leadTechnicianId: "u2",
      },
      {
        state: "FAILED_NO_SHOW",
        leadTechnician: { id: "u2", username: "tech2" },
        leadTechnicianId: "u2",
      },
      {
        state: "IN_PROGRESS",
        leadTechnician: null,
        leadTechnicianId: null,
      },
    ]);
    const out = await getDailyVisitSummary(new Date("2026-05-27"));
    expect(out.total).toBe(5);
    expect(out.completed).toBe(2);
    expect(out.scheduled).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.inProgress).toBe(1);
    expect(out.byTechnician).toHaveLength(2);
    const u1 = out.byTechnician.find((r) => r.techId === "u1");
    expect(u1?.total).toBe(2);
    expect(u1?.completed).toBe(2);
  });
});
