import { describe, it, expect } from "vitest";
import {
  createCustomerSchema,
  customerListQuerySchema,
} from "@/lib/validators/customer";

const validContractParty = {
  name: "Nguyễn Văn Lan",
  phone1: "0901234567",
  language: "vi",
};

describe("createCustomerSchema (B2C)", () => {
  // B2C since 2026-06: customer IS the contract party — top-level phone is
  // the only required contact field. No separate contractParty section.
  it("accepts a minimal B2C customer with top-level phone", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2C",
      name: "Test Customer",
      phone: "0901234567",
      opsContacts: [],
    });
    expect(res.success).toBe(true);
  });

  it("rejects a B2C customer missing the top-level phone", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2C",
      name: "Test Customer",
      opsContacts: [],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a B2C customer with an invalid phone format", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2C",
      name: "Test Customer",
      phone: "ab",
      opsContacts: [],
    });
    expect(res.success).toBe(false);
  });

  it("accepts a B2C customer without CCCD (optional since 2026-06)", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2C",
      name: "Test Customer",
      phone: "0901234567",
      residency: "DOMESTIC",
      opsContacts: [],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a foreign B2C without passport/nationality (optional since 2026-06)", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2C",
      name: "Test Customer",
      phone: "0901234567",
      residency: "FOREIGN",
      opsContacts: [],
    });
    expect(res.success).toBe(true);
  });
});

describe("createCustomerSchema (B2B)", () => {
  it("accepts a B2B customer with shortcode + tax code + at least one OPS", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2B",
      name: "Sheraton VN Ltd.",
      shortcode: "SHV",
      taxCode: "0312345678",
      contractParty: validContractParty,
      opsContacts: [
        { name: "Mai", phone1: "0901112233", language: "vi" },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("accepts B2B without OPS contacts (single-shot sale path since 2026-06)", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2B",
      name: "X",
      shortcode: "XX",
      taxCode: "0312345678",
      contractParty: validContractParty,
      opsContacts: [],
    });
    expect(res.success).toBe(true);
  });

  it("rejects bad shortcode format", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2B",
      name: "X",
      shortcode: "0X",
      taxCode: "0312345678",
      contractParty: validContractParty,
      opsContacts: [{ name: "A", phone1: "0901000000", language: "vi" }],
    });
    expect(res.success).toBe(false);
  });
});

describe("customerListQuerySchema", () => {
  it("coerces page/pageSize to integers", () => {
    const res = customerListQuerySchema.safeParse({ page: "2", pageSize: "10" });
    expect(res.success).toBe(true);
    expect(res.data?.page).toBe(2);
    expect(res.data?.pageSize).toBe(10);
  });

  it("uses defaults when missing", () => {
    const res = customerListQuerySchema.safeParse({});
    expect(res.success).toBe(true);
    expect(res.data?.page).toBe(1);
    expect(res.data?.pageSize).toBe(25);
  });

  it("rejects unknown type", () => {
    const res = customerListQuerySchema.safeParse({ type: "OTHER" });
    expect(res.success).toBe(false);
  });
});
