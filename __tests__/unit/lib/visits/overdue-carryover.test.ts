import { describe, it, expect } from "vitest";
import {
  resolveOverdueCarryoverKind,
  defaultReceiptKindForCustomerType,
  type OverdueCarryoverDeps,
} from "@/lib/visits/overdue-carryover";
import type { DocumentKind } from "@/generated/prisma/client";

function makeDb(opts: {
  overdueCount: number;
  priorDocKind: DocumentKind | null;
}): OverdueCarryoverDeps {
  return {
    payment: {
      count: async () => opts.overdueCount,
    },
    document: {
      findFirst: async () =>
        opts.priorDocKind === null ? null : { kind: opts.priorDocKind },
    },
  };
}

describe("resolveOverdueCarryoverKind", () => {
  it("returns null when the customer has no overdue payments", async () => {
    const db = makeDb({ overdueCount: 0, priorDocKind: "SALE_RECEIPT_B2C" });
    const kind = await resolveOverdueCarryoverKind(db, {
      customerId: "c1",
      customerType: "B2C",
    });
    expect(kind).toBeNull();
  });

  it("reuses the prior receipt-family kind when overdue exists", async () => {
    const db = makeDb({ overdueCount: 1, priorDocKind: "DELIVERY_RECEIPT" });
    const kind = await resolveOverdueCarryoverKind(db, {
      customerId: "c1",
      customerType: "B2C",
    });
    expect(kind).toBe("DELIVERY_RECEIPT");
  });

  it("falls back to the customer-type default when no prior receipt exists", async () => {
    const dbB2c = makeDb({ overdueCount: 1, priorDocKind: null });
    expect(
      await resolveOverdueCarryoverKind(dbB2c, {
        customerId: "c1",
        customerType: "B2C",
      }),
    ).toBe("SALE_RECEIPT_B2C");

    const dbB2b = makeDb({ overdueCount: 1, priorDocKind: null });
    expect(
      await resolveOverdueCarryoverKind(dbB2b, {
        customerId: "c2",
        customerType: "B2B",
      }),
    ).toBe("DELIVERY_SLIP_B2B");
  });
});

describe("defaultReceiptKindForCustomerType", () => {
  it("maps B2B → DELIVERY_SLIP_B2B, B2C → SALE_RECEIPT_B2C", () => {
    expect(defaultReceiptKindForCustomerType("B2B")).toBe("DELIVERY_SLIP_B2B");
    expect(defaultReceiptKindForCustomerType("B2C")).toBe("SALE_RECEIPT_B2C");
  });
});
