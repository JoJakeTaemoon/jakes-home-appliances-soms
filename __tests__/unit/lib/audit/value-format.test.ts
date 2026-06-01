/**
 * RED — locale-aware value formatter for diff table cells.
 */

import { describe, it, expect } from "vitest";
import { formatValue } from "@/lib/audit/value-format";

describe("formatValue — null/undefined", () => {
  it("returns localised placeholder for null", () => {
    expect(formatValue(null, "ko")).toMatch(/없음|미지정|—/);
    expect(formatValue(null, "en").toLowerCase()).toMatch(/none|—|—/);
    expect(formatValue(null, "vi").toLowerCase()).toMatch(/không|trống|—/);
  });

  it("returns the same placeholder for undefined", () => {
    expect(formatValue(undefined, "ko")).toBe(formatValue(null, "ko"));
  });
});

describe("formatValue — booleans", () => {
  it("renders true/false in Korean as 예/아니오", () => {
    expect(formatValue(true, "ko")).toBe("예");
    expect(formatValue(false, "ko")).toBe("아니오");
  });

  it("renders true/false in English", () => {
    expect(formatValue(true, "en")).toBe("Yes");
    expect(formatValue(false, "en")).toBe("No");
  });

  it("renders true/false in Vietnamese", () => {
    expect(formatValue(true, "vi").toLowerCase()).toMatch(/có|đúng/);
    expect(formatValue(false, "vi").toLowerCase()).toMatch(/không|sai/);
  });
});

describe("formatValue — dates", () => {
  it("recognises ISO datetime and formats with locale", () => {
    const iso = "2026-05-26T10:00:00.000Z";
    const out = formatValue(iso, "en");
    expect(out).not.toBe(iso); // formatted, not raw
    expect(out.length).toBeGreaterThan(0);
  });

  it("does not mangle non-ISO strings that look short", () => {
    expect(formatValue("hello world", "ko")).toBe("hello world");
  });

  it("VI date format uses DD/MM/YYYY", () => {
    const iso = "2026-05-26T00:00:00.000Z";
    const out = formatValue(iso, "vi");
    // Expect day first
    expect(out).toMatch(/26.*05.*2026|26.*5.*2026/);
  });
});

describe("formatValue — referenceId hint", () => {
  it("resolves a referenceId to a display name via the resolver map", () => {
    const map = new Map<string, string>([["Customer:c1", "김철수"]]);
    const out = formatValue("c1", "ko", {
      kind: "referenceId",
      entityType: "Customer",
      resolved: map,
    });
    expect(out).toContain("김철수");
  });

  it("falls back to id if resolver has no entry", () => {
    const map = new Map<string, string>();
    const out = formatValue("c1", "ko", {
      kind: "referenceId",
      entityType: "Customer",
      resolved: map,
    });
    expect(out).toContain("c1");
  });
});

describe("formatValue — numbers", () => {
  it("renders integers as-is", () => {
    expect(formatValue(42, "en")).toBe("42");
  });

  it("renders money with currency hint", () => {
    const out = formatValue(120_000, "vi", { kind: "money" });
    // 120,000 with VND-ish separators
    expect(out).toMatch(/120[\s.,]?000/);
  });
});

describe("formatValue — objects/arrays", () => {
  it("stringifies a nested object compactly", () => {
    const out = formatValue({ a: 1, b: 2 }, "en");
    expect(out).toContain("a");
    expect(out).toContain("1");
  });

  it("stringifies an array", () => {
    const out = formatValue([1, 2, 3], "en");
    expect(out).toContain("1");
    expect(out).toContain("3");
  });
});
