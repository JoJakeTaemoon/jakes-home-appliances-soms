import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatVnd, parseVnd } from "@/lib/format";

describe("formatDate", () => {
  it("uses DD/MM/YYYY for vi", () => {
    expect(formatDate(new Date("2026-05-27T10:00:00Z"), "vi")).toBe("27/05/2026");
  });
  it("uses YYYY-MM-DD for ko/en/default", () => {
    expect(formatDate(new Date("2026-05-27T10:00:00Z"), "ko")).toBe("2026-05-27");
    expect(formatDate(new Date("2026-05-27T10:00:00Z"), "en")).toBe("2026-05-27");
  });
  it("returns empty string for nullish", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
  });
  it("returns empty for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("appends 24h time", () => {
    const d = new Date(2026, 4, 27, 14, 5);
    expect(formatDateTime(d, "vi")).toBe("27/05/2026 14:05");
    expect(formatDateTime(d, "ko")).toBe("2026-05-27 14:05");
  });
});

describe("formatVnd", () => {
  it("formats whole numbers with dot separators + ₫", () => {
    expect(formatVnd(0)).toBe("0 ₫");
    expect(formatVnd(1_500_000)).toBe("1.500.000 ₫");
    expect(formatVnd("8500000")).toBe("8.500.000 ₫");
  });
  it("rounds + handles negatives", () => {
    expect(formatVnd(-1_234)).toBe("-1.234 ₫");
    expect(formatVnd(1234.6)).toBe("1.235 ₫");
  });
  it("returns empty for nullish", () => {
    expect(formatVnd(null)).toBe("");
    expect(formatVnd(undefined)).toBe("");
  });
});

describe("parseVnd", () => {
  it("parses formatted strings", () => {
    expect(parseVnd("1.500.000 ₫")).toBe(1_500_000);
    expect(parseVnd("8,500,000")).toBe(8_500_000);
    expect(parseVnd("12345")).toBe(12345);
  });
  it("returns null for unparseable", () => {
    expect(parseVnd("")).toBeNull();
    expect(parseVnd(null)).toBeNull();
    expect(parseVnd("abc")).toBeNull();
  });
});
