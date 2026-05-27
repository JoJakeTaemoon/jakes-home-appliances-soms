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
  it("accepts a minimal B2C customer", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2C",
      name: "Test Customer",
      contractParty: validContractParty,
      opsContacts: [],
    });
    expect(res.success).toBe(true);
  });

  it("rejects missing phone in contract party", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2C",
      name: "Test",
      contractParty: { name: "Anon", language: "vi" },
      opsContacts: [],
    });
    expect(res.success).toBe(false);
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

  it("rejects B2B without OPS contacts", () => {
    const res = createCustomerSchema.safeParse({
      type: "B2B",
      name: "X",
      shortcode: "XX",
      taxCode: "0312345678",
      contractParty: validContractParty,
      opsContacts: [],
    });
    expect(res.success).toBe(false);
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
