/**
 * The two rules the monthly bill is built from — when it falls due and how
 * much it is for. Shared by the recurring-payment job, the data migration and
 * the "this contract never bills" warning, so all three agree.
 */
import { describe, it, expect } from "vitest";
import { dueDateForMonth, monthlyBillingAmount } from "@/lib/payments/billing";

describe("dueDateForMonth", () => {
  it("falls on the 10th when the contract has no billing day", () => {
    expect(dueDateForMonth(new Date("2026-06-01"), null).toISOString()).toBe(
      "2026-06-10T23:59:59.000Z",
    );
  });

  it("falls on the contract's billing day", () => {
    expect(dueDateForMonth(new Date("2026-06-17"), 25).toISOString()).toBe(
      "2026-06-25T23:59:59.000Z",
    );
  });

  it("pulls a day the month does not have back to its last day", () => {
    expect(dueDateForMonth(new Date("2026-02-03"), 31).toISOString()).toBe(
      "2026-02-28T23:59:59.000Z",
    );
  });
});

describe("monthlyBillingAmount", () => {
  const money = (v: string) => ({ toString: () => v });

  it("is the contract's monthly fee", () => {
    expect(
      monthlyBillingAmount({ type: "MAINTENANCE", monthlyMaintenanceFee: money("150000"), equipment: [] }),
    ).toBe(150000);
  });

  it("adds up the units of a rental that has no fee of its own", () => {
    expect(
      monthlyBillingAmount({
        type: "RENTAL",
        monthlyMaintenanceFee: null,
        equipment: [
          { unitPrice: money("300000"), quantity: 2 },
          { unitPrice: null, quantity: 1 },
        ],
      }),
    ).toBe(600000);
  });

  it("is zero for a maintenance contract with no fee — it never bills", () => {
    expect(
      monthlyBillingAmount({
        type: "MAINTENANCE",
        monthlyMaintenanceFee: null,
        equipment: [{ unitPrice: money("300000"), quantity: 1 }],
      }),
    ).toBe(0);
  });
});
