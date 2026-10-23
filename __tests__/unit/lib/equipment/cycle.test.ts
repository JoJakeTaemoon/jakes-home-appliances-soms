import { describe, it, expect } from "vitest";
import { addDays, nextDueDate } from "@/lib/equipment/cycle";

describe("cycle", () => {
  it("adds days across month/year boundaries", () => {
    expect(addDays("2026-01-01", 90)).toBe("2026-04-01");
    expect(addDays("2026-12-01", 365)).toBe("2027-12-01");
  });
  it("nextDueDate = lastReplaced + cycleDays", () => {
    expect(nextDueDate("2026-07-09", 120)).toBe("2026-11-06");
  });
});

import { addCycle, cycleDaysOf } from "@/lib/equipment/cycle";

describe("addCycle — a unit's filter cycle in days or calendar months", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const ymd = (x: Date) => x.toISOString().slice(0, 10);

  it("adds days for a day cycle", () => {
    expect(ymd(addCycle(d("2026-08-22"), 180, "DAY"))).toBe("2027-02-18");
  });

  it("steps calendar months for a month cycle stored as months × 30", () => {
    expect(ymd(addCycle(d("2026-08-22"), 180, "MONTH"))).toBe("2027-02-22");
    expect(ymd(addCycle(d("2026-08-22"), 360, "MONTH"))).toBe("2027-08-22");
  });

  it("lands on the last day when the month is shorter", () => {
    expect(ymd(addCycle(d("2026-01-31"), 30, "MONTH"))).toBe("2026-02-28");
  });

  it("treats a missing unit as days", () => {
    expect(ymd(addCycle(d("2026-08-22"), 10, null))).toBe("2026-09-01");
  });

  it("keeps the time of day", () => {
    expect(addCycle(new Date("2026-08-22T09:30:00Z"), 30, "MONTH").toISOString()).toBe("2026-09-22T09:30:00.000Z");
  });
});

describe("cycleDaysOf — the box value + unit → stored days", () => {
  it("stores months as months × 30", () => {
    expect(cycleDaysOf(6, "MONTH")).toBe(180);
    expect(cycleDaysOf(45, "DAY")).toBe(45);
  });
});
