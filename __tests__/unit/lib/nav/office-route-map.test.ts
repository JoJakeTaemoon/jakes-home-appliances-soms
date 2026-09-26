import { describe, it, expect } from "vitest";
import { computeOfficeCrumbs, parentCrumb } from "@/lib/nav/office-route-map";

describe("office breadcrumb — grouping segments", () => {
  it("marks /o/admin as a label, not a link (it has no page)", () => {
    const crumbs = computeOfficeCrumbs("/o/admin/products")!;
    expect(crumbs.map((c) => [c.href, c.linkable])).toEqual([
      ["/o", true],
      ["/o/admin", false],
      ["/o/admin/products", true],
    ]);
  });

  it("sends 뒤로 past the grouping label to a real page", () => {
    expect(parentCrumb(computeOfficeCrumbs("/o/admin/products")!)?.href).toBe("/o");
  });

  it("keeps the ordinary parent for normal pages", () => {
    expect(parentCrumb(computeOfficeCrumbs("/o/customers/abc/edit")!)?.href).toBe("/o/customers/abc");
    expect(parentCrumb(computeOfficeCrumbs("/o/customers/abc")!)?.href).toBe("/o/customers");
  });

  it("shows no back button at depth 1", () => {
    expect(parentCrumb(computeOfficeCrumbs("/o/customers")!)).toBeNull();
  });
});
