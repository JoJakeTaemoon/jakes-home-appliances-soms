import { describe, it, expect } from "vitest";
import { classificationIssues } from "@/lib/products/classification";

describe("classificationIssues", () => {
  it("passes a model in one or more 제품군 with no type", () => {
    expect(classificationIssues({ categoryIds: ["a"], typeCategoryIds: null })).toEqual([]);
    expect(classificationIssues({ categoryIds: ["a", "b"], typeCategoryIds: null })).toEqual([]);
  });

  it("refuses a model with no 제품군", () => {
    const issues = classificationIssues({ categoryIds: [], typeCategoryIds: null });
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(["categoryIds"]);
  });

  it("passes when every 제품군 belongs to the type", () => {
    expect(
      classificationIssues({ categoryIds: ["a", "b"], typeCategoryIds: ["a", "b", "c"] }),
    ).toEqual([]);
  });

  it("refuses a 제품군 outside the type", () => {
    const issues = classificationIssues({ categoryIds: ["a", "z"], typeCategoryIds: ["a", "b"] });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/제품 유형/);
  });

  it("reports an empty set under a type once", () => {
    // Empty is empty — no "outside" issue on top of it.
    const issues = classificationIssues({ categoryIds: [], typeCategoryIds: ["a"] });
    expect(issues).toHaveLength(1);
  });
});
