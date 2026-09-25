import { describe, it, expect } from "vitest";
import { ApiClientError, apiErrorText } from "@/lib/api/client";

const validationFailure = (
  issues: { path: (string | number)[]; message: string }[],
) =>
  new ApiClientError({
    message: "Invalid body",
    code: "VALIDATION_ERROR",
    status: 400,
    issues,
  });

describe("apiErrorText", () => {
  it("names the offending field instead of a bare 'Invalid body'", () => {
    // The consumable form POSTed a blank SKU and showed nothing useful.
    const text = apiErrorText(
      validationFailure([
        { path: ["sku"], message: "SKU must be 2-30 chars, letters/digits/dash" },
      ]),
      "fallback",
    );
    expect(text).toContain("sku");
    expect(text).toContain("SKU must be 2-30 chars");
  });

  it("lists every failing field", () => {
    const text = apiErrorText(
      validationFailure([
        { path: ["sku"], message: "required" },
        { path: ["compatibleModels", 0, "modelId"], message: "required" },
      ]),
      "fallback",
    );
    expect(text).toContain("sku: required");
    expect(text).toContain("compatibleModels.0.modelId: required");
  });

  it("falls back to the plain message when there are no issues", () => {
    const e = new ApiClientError({
      message: "Category code WATER_PURIFIER already exists",
      code: "CONFLICT",
      status: 409,
    });
    expect(apiErrorText(e, "fallback")).toBe(
      "Category code WATER_PURIFIER already exists",
    );
  });

  it("uses the caller's fallback for a non-Error throw", () => {
    expect(apiErrorText("boom", "fallback")).toBe("fallback");
    expect(apiErrorText(new Error("network down"), "fallback")).toBe("network down");
  });
});
