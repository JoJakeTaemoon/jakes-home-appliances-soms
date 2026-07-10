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
