import { describe, it, expect } from "vitest";
import { __test } from "@/lib/service-requests/code";

describe("ServiceRequest code allocator helpers", () => {
  it("formats a 5-digit zero-padded sequence", () => {
    expect(__test.format(1)).toBe("SR-00001");
    expect(__test.format(42)).toBe("SR-00042");
    expect(__test.format(12345)).toBe("SR-12345");
  });

  it("parses a code back into a number", () => {
    expect(__test.parse("SR-00001")).toBe(1);
    expect(__test.parse("SR-99999")).toBe(99999);
  });

  it("returns null for malformed codes", () => {
    expect(__test.parse("KH-00001")).toBeNull();
    expect(__test.parse("INVALID")).toBeNull();
  });

  it("uses PREFIX + PAD constants consistently", () => {
    expect(__test.PREFIX).toBe("SR-");
    expect(__test.PAD).toBe(5);
  });
});
