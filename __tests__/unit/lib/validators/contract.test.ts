import { describe, it, expect } from "vitest";
import {
  createContractSchema,
  contractAmendSchema,
  contractStateTransitionSchema,
  contractRenewSchema,
  contractListQuerySchema,
} from "@/lib/validators/contract";

describe("createContractSchema", () => {
  it("accepts a SALE contract with totalContractValue", () => {
    const res = createContractSchema.safeParse({
      type: "SALE",
      customerId: "c1",
      equipment: [{ equipmentId: "e1", unitPrice: 1_000_000, quantity: 1 }],
      totalContractValue: 1_000_000,
    });
    expect(res.success).toBe(true);
  });
  it("accepts a RENTAL contract and defaults termMonths to 36", () => {
    const res = createContractSchema.safeParse({
      type: "RENTAL",
      customerId: "c1",
      equipment: [{ equipmentId: "e1", unitPrice: null, quantity: 1 }],
      monthlyMaintenanceFee: 150_000,
    });
    expect(res.success).toBe(true);
    if (res.success) expect((res.data as { termMonths: number }).termMonths).toBe(36);
  });
  it("rejects empty equipment array", () => {
    const res = createContractSchema.safeParse({
      type: "MAINTENANCE",
      customerId: "c1",
      equipment: [],
      monthlyMaintenanceFee: 100_000,
    });
    expect(res.success).toBe(false);
  });
});

describe("contractAmendSchema", () => {
  it("accepts FEE_ADJUST with a numeric fee", () => {
    const res = contractAmendSchema.safeParse({
      changeType: "FEE_ADJUST",
      monthlyMaintenanceFee: 200_000,
      reason: "Annual adjustment",
    });
    expect(res.success).toBe(true);
  });
  it("rejects FEE_ADJUST without fee", () => {
    const res = contractAmendSchema.safeParse({
      changeType: "FEE_ADJUST",
      reason: "no fee provided",
    });
    expect(res.success).toBe(false);
  });
  it("accepts ADD_EQUIPMENT with at least one line", () => {
    const res = contractAmendSchema.safeParse({
      changeType: "ADD_EQUIPMENT",
      equipment: [{ equipmentId: "e1", unitPrice: null, quantity: 2 }],
      reason: "Add 2 units to floor 5",
    });
    expect(res.success).toBe(true);
  });
});

describe("contractStateTransitionSchema", () => {
  it("accepts known state targets", () => {
    expect(
      contractStateTransitionSchema.safeParse({ to: "ACTIVE" }).success,
    ).toBe(true);
    expect(
      contractStateTransitionSchema.safeParse({ to: "TERMINATED", reason: "test" }).success,
    ).toBe(true);
  });
  it("rejects unknown state target", () => {
    const res = contractStateTransitionSchema.safeParse({ to: "PURPLE" });
    expect(res.success).toBe(false);
  });
});

describe("contractRenewSchema", () => {
  it("accepts an empty object", () => {
    expect(contractRenewSchema.safeParse({}).success).toBe(true);
  });
  it("rejects negative fee value", () => {
    const res = contractRenewSchema.safeParse({ monthlyMaintenanceFee: -1 });
    expect(res.success).toBe(false);
  });
});

describe("contractListQuerySchema", () => {
  it("defaults page=1, pageSize=25", () => {
    const res = contractListQuerySchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.page).toBe(1);
      expect(res.data.pageSize).toBe(25);
    }
  });
  it("coerces page + pageSize from query strings", () => {
    const res = contractListQuerySchema.safeParse({ page: "2", pageSize: "50" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.page).toBe(2);
      expect(res.data.pageSize).toBe(50);
    }
  });
});
