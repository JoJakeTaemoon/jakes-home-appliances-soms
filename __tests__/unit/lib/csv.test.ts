import { describe, it, expect } from "vitest";
import { toCsv, csvResponse } from "@/lib/csv";

describe("toCsv", () => {
  it("emits BOM + header from inferred keys", () => {
    const out = toCsv([{ a: 1, b: 2 }]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("a,b\r\n1,2\r\n");
  });

  it("uses explicit column labels + order", () => {
    const out = toCsv(
      [{ name: "Alice", age: 30 }],
      [
        { key: "age", label: "Age" },
        { key: "name", label: "Full Name" },
      ],
    );
    expect(out).toContain("Age,Full Name\r\n30,Alice\r\n");
  });

  it("quotes cells with commas, quotes, or newlines", () => {
    const out = toCsv([{ a: 'hello, "world"\nline' }]);
    expect(out).toContain('"hello, ""world""\nline"');
  });

  it("emits header-only when rows empty + columns given", () => {
    const out = toCsv<{ a: string }>([], [{ key: "a", label: "A" }]);
    expect(out).toBe("﻿A\r\n");
  });

  it("applies format hook", () => {
    const out = toCsv(
      [{ d: new Date("2026-05-27T00:00:00Z") }],
      [{ key: "d", label: "Date", format: (v) => (v as Date).toISOString().slice(0, 10) }],
    );
    expect(out).toContain("Date\r\n2026-05-27\r\n");
  });
});

describe("csvResponse", () => {
  it("sets content-type + content-disposition", async () => {
    const res = csvResponse("x", "out.csv");
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain('filename="out.csv"');
    expect(await res.text()).toBe("x");
  });
});
