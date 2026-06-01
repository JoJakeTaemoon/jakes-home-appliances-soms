/**
 * RED — shallow diff for audit before/after payloads.
 *
 * Output is `DiffEntry[]` with `{ field, beforeValue, afterValue, kind }`,
 * where `kind` ∈ "created" | "deleted" | "updated".
 *
 * - CREATE (before=null, after=obj) → all after keys, kind="created"
 * - DELETE (before=obj, after=null) → all before keys, kind="deleted"
 * - UPDATE (both obj) → changed keys only, kind="updated"
 * - Equal values (Object.is or JSON-equal) skipped from UPDATE
 */

import { describe, it, expect } from "vitest";
import { computeDiff } from "@/lib/audit/diff";

describe("computeDiff — UPDATE", () => {
  it("returns changed fields only", () => {
    const before = { name: "Jake", age: 30, city: "Seoul" };
    const after = { name: "Jake", age: 31, city: "Seoul" };
    const out = computeDiff(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      field: "age",
      beforeValue: 30,
      afterValue: 31,
      kind: "updated",
    });
  });

  it("detects multiple changed fields", () => {
    const before = { a: 1, b: 2, c: 3 };
    const after = { a: 10, b: 20, c: 3 };
    const out = computeDiff(before, after);
    expect(out).toHaveLength(2);
    const fields = out.map((d) => d.field).sort();
    expect(fields).toEqual(["a", "b"]);
  });

  it("treats deeply-equal nested objects as unchanged", () => {
    const before = { meta: { x: 1, y: 2 } };
    const after = { meta: { x: 1, y: 2 } };
    expect(computeDiff(before, after)).toHaveLength(0);
  });

  it("detects new field appearing in after only", () => {
    const before = { a: 1 };
    const after = { a: 1, b: 2 };
    const out = computeDiff(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      field: "b",
      beforeValue: undefined,
      afterValue: 2,
      kind: "updated",
    });
  });

  it("detects removed field present in before only", () => {
    const before = { a: 1, b: 2 };
    const after = { a: 1 };
    const out = computeDiff(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      field: "b",
      beforeValue: 2,
      afterValue: undefined,
      kind: "updated",
    });
  });
});

describe("computeDiff — CREATE", () => {
  it("returns every after key when before is null", () => {
    const after = { name: "Jake", role: "ADMIN" };
    const out = computeDiff(null, after);
    expect(out).toHaveLength(2);
    expect(out.every((d) => d.kind === "created")).toBe(true);
    expect(out.find((d) => d.field === "name")?.afterValue).toBe("Jake");
  });

  it("treats undefined before as CREATE", () => {
    const after = { name: "x" };
    const out = computeDiff(undefined, after);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("created");
  });

  it("returns empty array when both are null", () => {
    expect(computeDiff(null, null)).toHaveLength(0);
  });
});

describe("computeDiff — DELETE", () => {
  it("returns every before key when after is null", () => {
    const before = { name: "Jake", role: "ADMIN" };
    const out = computeDiff(before, null);
    expect(out).toHaveLength(2);
    expect(out.every((d) => d.kind === "deleted")).toBe(true);
    expect(out.find((d) => d.field === "name")?.beforeValue).toBe("Jake");
  });
});

describe("computeDiff — robustness", () => {
  it("handles non-object before/after gracefully", () => {
    // primitives should not crash; return empty
    expect(computeDiff(1, 2)).toEqual([]);
    expect(computeDiff("a", "b")).toEqual([]);
  });

  it("sorts entries by field name for stable rendering", () => {
    const before = { c: 1, a: 1, b: 1 };
    const after = { c: 2, a: 2, b: 2 };
    const out = computeDiff(before, after);
    expect(out.map((d) => d.field)).toEqual(["a", "b", "c"]);
  });
});
