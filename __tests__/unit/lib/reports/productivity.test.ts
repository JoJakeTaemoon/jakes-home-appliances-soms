/**
 * Technician productivity report — durations + late handovers.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    visit: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getTechnicianProductivity } from "@/lib/reports/technician-productivity";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.visit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("getTechnicianProductivity", () => {
  it("returns empty array when no visits", async () => {
    const out = await getTechnicianProductivity({
      start: new Date("2026-05-01"),
      end: new Date("2026-05-31"),
    });
    expect(out).toEqual([]);
  });

  it("counts completions and avg duration", async () => {
    (prisma.visit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        leadTechnicianId: "u1",
        startedAt: new Date("2026-05-10T09:00:00Z"),
        completedAt: new Date("2026-05-10T10:00:00Z"), // 60 min
        leadTechnician: { id: "u1", username: "tech1" },
      },
      {
        leadTechnicianId: "u1",
        startedAt: new Date("2026-05-11T09:00:00Z"),
        completedAt: new Date("2026-05-11T10:30:00Z"), // 90 min
        leadTechnician: { id: "u1", username: "tech1" },
      },
    ]);
    const out = await getTechnicianProductivity({
      start: new Date("2026-05-01"),
      end: new Date("2026-05-31"),
    });
    expect(out).toHaveLength(1);
    expect(out[0].visitsCompleted).toBe(2);
    expect(out[0].avgDurationMinutes).toBe(75);
  });

  it("flags late handovers (> 48h)", async () => {
    (prisma.visit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        leadTechnicianId: "u1",
        startedAt: new Date("2026-05-10T09:00:00Z"),
        completedAt: new Date("2026-05-10T10:00:00Z"),
        leadTechnician: { id: "u1", username: "tech1" },
      },
    ]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        collectedById: "u1",
        collectedAt: new Date("2026-05-10T10:00:00Z"),
        handedOverAt: new Date("2026-05-13T11:00:00Z"), // ~73h later
      },
      {
        collectedById: "u1",
        collectedAt: new Date("2026-05-10T10:00:00Z"),
        handedOverAt: new Date("2026-05-11T10:00:00Z"), // 24h
      },
    ]);
    const out = await getTechnicianProductivity({
      start: new Date("2026-05-01"),
      end: new Date("2026-05-31"),
    });
    expect(out[0].lateHandoversCount).toBe(1);
  });
});
