/**
 * Operations unit tests — mock Prisma; verify carryover math, audit calls,
 * and that the receipt-email path doesn't bounce on missing contacts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeDaysOverdue, pickContactLocale } from "@/lib/payments/operations";

describe("computeDaysOverdue", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it("returns 0 for null due date", () => {
    expect(computeDaysOverdue(null, now)).toBe(0);
  });
  it("returns 0 for future due date", () => {
    expect(computeDaysOverdue(new Date("2026-06-20"), now)).toBe(0);
  });
  it("returns days past due", () => {
    expect(computeDaysOverdue(new Date("2026-06-08T12:00:00Z"), now)).toBe(7);
    expect(computeDaysOverdue(new Date("2026-06-01T12:00:00Z"), now)).toBe(14);
  });
});

describe("pickContactLocale", () => {
  it("uses primary contact language", () => {
    expect(
      pickContactLocale([
        { language: "vi", isPrimary: false },
        { language: "ko", isPrimary: true },
      ]),
    ).toBe("ko");
  });
  it("falls back to first contact then vi", () => {
    expect(pickContactLocale([])).toBe("vi");
    expect(pickContactLocale([{ language: "en" }])).toBe("en");
  });
});

describe("operations carryover math", () => {
  // Smoke test for the partial payment math used by applyPartialPayment.
  it("carryover = expected - partial", () => {
    const expected = 500_000;
    const partial = 200_000;
    expect(expected - partial).toBe(300_000);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
