import { describe, it, expect } from "vitest";
import { createContactSchema } from "@/lib/validators/customerContact";
import { createSiteSchema } from "@/lib/validators/site";

describe("createContactSchema", () => {
  it("accepts CONTRACT_PARTY with scope=CUSTOMER", () => {
    const res = createContactSchema.safeParse({
      role: "CONTRACT_PARTY",
      scope: "CUSTOMER",
      name: "X",
      phone1: "0901111111",
      language: "vi",
    });
    expect(res.success).toBe(true);
  });

  it("rejects CONTRACT_PARTY with scope=SITE", () => {
    const res = createContactSchema.safeParse({
      role: "CONTRACT_PARTY",
      scope: "SITE",
      siteId: "s1",
      name: "X",
      phone1: "0901111111",
      language: "vi",
    });
    expect(res.success).toBe(false);
  });

  it("requires siteId when scope=SITE", () => {
    const res = createContactSchema.safeParse({
      role: "OPS_CONTACT",
      scope: "SITE",
      name: "X",
      phone1: "0901111111",
      language: "vi",
    });
    expect(res.success).toBe(false);
  });
});

describe("createSiteSchema", () => {
  it("requires name; structured address fields are all optional (since 2026-06)", () => {
    // Empty body: no name → rejected.
    expect(createSiteSchema.safeParse({}).success).toBe(false);
    // Name alone: accepted (address can be filled in later, e.g. site shell
    // for an unstaged B2B customer).
    expect(createSiteSchema.safeParse({ name: "X" }).success).toBe(true);
    // Name + a structured address field: accepted.
    expect(
      createSiteSchema.safeParse({ name: "X", addressStreet: "Y" }).success,
    ).toBe(true);
  });
});
