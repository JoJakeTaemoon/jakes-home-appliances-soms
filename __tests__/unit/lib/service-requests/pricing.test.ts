import { describe, it, expect } from "vitest";
import { determineIsPaid, srTypeToVisitType } from "@/lib/service-requests/pricing";

const NOW = new Date("2026-05-27T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}

describe("determineIsPaid — INSPECTION", () => {
  it("free when equipment is under active maintenance contract", () => {
    const r = determineIsPaid({
      type: "INSPECTION",
      customerType: "B2C",
      equipment: { id: "e1", installedAt: daysAgo(400) },
      contracts: [{ type: "MAINTENANCE" }],
      now: NOW,
    });
    expect(r.isPaid).toBe(false);
    expect(r.reason).toBe("covered-by-maintenance");
  });

  it("free when equipment is under active rental contract", () => {
    const r = determineIsPaid({
      type: "INSPECTION",
      equipment: { id: "e1", installedAt: daysAgo(400) },
      contracts: [{ type: "RENTAL" }],
      now: NOW,
    });
    expect(r.isPaid).toBe(false);
    expect(r.reason).toBe("covered-by-maintenance");
  });

  it("free when within first 90 days of install", () => {
    const r = determineIsPaid({
      type: "INSPECTION",
      equipment: { id: "e1", installedAt: daysAgo(45) },
      contracts: [],
      now: NOW,
    });
    expect(r.isPaid).toBe(false);
    expect(r.reason).toBe("within-install-window");
  });

  it("paid when out-of-warranty + no maintenance contract", () => {
    const r = determineIsPaid({
      type: "INSPECTION",
      equipment: { id: "e1", installedAt: daysAgo(200) },
      contracts: [],
      now: NOW,
    });
    expect(r.isPaid).toBe(true);
    expect(r.reason).toBe("paid-default");
  });
});

describe("determineIsPaid — REPAIR", () => {
  it("free when within 180-day warranty window", () => {
    const r = determineIsPaid({
      type: "REPAIR",
      equipment: { id: "e1", installedAt: daysAgo(100) },
      contracts: [],
      now: NOW,
    });
    expect(r.isPaid).toBe(false);
    expect(r.reason).toBe("under-warranty");
  });

  it("free when under active rental (Seoul Aqua still owns)", () => {
    const r = determineIsPaid({
      type: "REPAIR",
      equipment: { id: "e1", installedAt: daysAgo(400) },
      contracts: [{ type: "RENTAL" }],
      now: NOW,
    });
    expect(r.isPaid).toBe(false);
    expect(r.reason).toBe("covered-by-maintenance");
  });

  it("paid when out of warranty + sale-only", () => {
    const r = determineIsPaid({
      type: "REPAIR",
      equipment: { id: "e1", installedAt: daysAgo(400) },
      contracts: [{ type: "SALE" }],
      now: NOW,
    });
    expect(r.isPaid).toBe(true);
  });
});

describe("determineIsPaid — PART_REPLACEMENT", () => {
  it("free under maintenance contract (scheduled filter)", () => {
    const r = determineIsPaid({
      type: "PART_REPLACEMENT",
      equipment: { id: "e1", installedAt: daysAgo(200) },
      contracts: [{ type: "MAINTENANCE" }],
      now: NOW,
    });
    expect(r.isPaid).toBe(false);
    expect(r.reason).toBe("scheduled-filter");
  });

  it("paid for sale-only customer", () => {
    const r = determineIsPaid({
      type: "PART_REPLACEMENT",
      equipment: { id: "e1", installedAt: daysAgo(200) },
      contracts: [{ type: "SALE" }],
      now: NOW,
    });
    expect(r.isPaid).toBe(true);
  });
});

describe("determineIsPaid — RELOCATION", () => {
  it("free for first relocation within 90 days of install", () => {
    const r = determineIsPaid({
      type: "RELOCATION",
      equipment: {
        id: "e1",
        installedAt: daysAgo(30),
        hadPriorRelocation: false,
      },
      contracts: [],
      now: NOW,
    });
    expect(r.isPaid).toBe(false);
    expect(r.reason).toBe("first-relocation");
  });

  it("paid when a prior relocation exists", () => {
    const r = determineIsPaid({
      type: "RELOCATION",
      equipment: {
        id: "e1",
        installedAt: daysAgo(30),
        hadPriorRelocation: true,
      },
      contracts: [],
      now: NOW,
    });
    expect(r.isPaid).toBe(true);
  });

  it("paid when outside 90-day grace", () => {
    const r = determineIsPaid({
      type: "RELOCATION",
      equipment: {
        id: "e1",
        installedAt: daysAgo(120),
        hadPriorRelocation: false,
      },
      contracts: [],
      now: NOW,
    });
    expect(r.isPaid).toBe(true);
  });
});

describe("determineIsPaid — OTHER", () => {
  it("paid by default", () => {
    const r = determineIsPaid({ type: "OTHER", now: NOW });
    expect(r.isPaid).toBe(true);
    expect(r.reason).toBe("paid-default");
  });
});

describe("srTypeToVisitType", () => {
  it("maps each SR type to a visit type", () => {
    expect(srTypeToVisitType("INSPECTION")).toBe("PERIODIC_INSPECTION");
    expect(srTypeToVisitType("REPAIR")).toBe("REPAIR");
    expect(srTypeToVisitType("PART_REPLACEMENT")).toBe("FILTER_REPLACEMENT");
    expect(srTypeToVisitType("RELOCATION")).toBe("RELOCATION");
    expect(srTypeToVisitType("OTHER")).toBe("OTHER");
  });
});
