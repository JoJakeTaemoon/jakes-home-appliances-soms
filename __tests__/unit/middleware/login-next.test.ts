/**
 * A shared link opened while signed out must come back with its query string
 * after login — the filters live in it.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import middleware from "@/middleware";

describe("middleware login redirect", () => {
  it("carries the original query inside `next`, not on the login URL", () => {
    const res = middleware(new NextRequest("http://localhost/o/ko/equipment?installedFrom=2024-01-01&status=ACTIVE"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/o/ko/login");
    expect([...loc.searchParams.keys()]).toEqual(["next"]);
    expect(loc.searchParams.get("next")).toBe("/o/equipment?installedFrom=2024-01-01&status=ACTIVE");
  });
});
