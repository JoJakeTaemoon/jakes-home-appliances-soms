import { describe, it, expect } from "vitest";
import { cycleToStored, cycleToDisplay } from "@/lib/catalog/cycle-unit";

describe("catalog cycle-unit conversion", () => {
  it("stores days as-is, months × 30", () => {
    expect(cycleToStored("180", "DAY")).toBe(180);
    expect(cycleToStored("6", "MONTH")).toBe(180);
  });

  it("treats empty / non-numeric as null", () => {
    expect(cycleToStored("", "DAY")).toBeNull();
    expect(cycleToStored("", "MONTH")).toBeNull();
    expect(cycleToStored("abc", "DAY")).toBeNull();
  });

  it("displays days as-is, months ÷ 30", () => {
    expect(cycleToDisplay(180, "DAY")).toBe("180");
    expect(cycleToDisplay(180, "MONTH")).toBe("6");
    expect(cycleToDisplay(null, "DAY")).toBe("");
  });

  it("round-trips month input", () => {
    const stored = cycleToStored("3", "MONTH"); // 90 days
    expect(stored).toBe(90);
    expect(cycleToDisplay(stored, "MONTH")).toBe("3");
  });

  it("keeps storage integer for non-30-multiple month conversions", () => {
    // 365 days shown as months, then stored again, must stay a whole day count
    // (the schema column is Int) rather than 12.166… or 365.1.
    expect(cycleToDisplay(365, "MONTH")).toBe("12.17");
    expect(cycleToStored("12.17", "MONTH")).toBe(365);
    expect(Number.isInteger(cycleToStored("12.17", "MONTH"))).toBe(true);
  });
});
