import { describe, it, expect } from "vitest";
import {
  canCreateExpectedPayment,
  canHandOver,
  canReconcile,
  canWriteOff,
  canIssueTaxInvoice,
  isOfficeRole,
  isManagerOrHigher,
  paymentScopeForActor,
} from "@/lib/payments/access";

describe("payment role gates", () => {
  it("STAFF can create EXPECTED + record bank transfer", () => {
    expect(canCreateExpectedPayment("STAFF")).toBe(true);
    expect(canCreateExpectedPayment("TECHNICIAN")).toBe(false);
  });

  it("MANAGER+ only can reconcile + write off + tax invoice", () => {
    expect(canReconcile("MANAGER")).toBe(true);
    expect(canReconcile("ADMIN")).toBe(true);
    expect(canReconcile("STAFF")).toBe(false);
    expect(canWriteOff("STAFF")).toBe(false);
    expect(canIssueTaxInvoice("STAFF")).toBe(false);
    expect(canIssueTaxInvoice("MANAGER")).toBe(true);
  });

  it("technician self-hand-over (collector only)", () => {
    expect(
      canHandOver("TECHNICIAN", {
        paymentCollectedById: "u1",
        actorUserId: "u1",
      }),
    ).toBe(true);
    expect(
      canHandOver("TECHNICIAN", {
        paymentCollectedById: "u1",
        actorUserId: "u2",
      }),
    ).toBe(false);
  });

  it("office handover always allowed", () => {
    expect(
      canHandOver("STAFF", {
        paymentCollectedById: "u1",
        actorUserId: "u2",
      }),
    ).toBe(true);
  });

  it("isOfficeRole + isManagerOrHigher", () => {
    expect(isOfficeRole("STAFF")).toBe(true);
    expect(isOfficeRole("MANAGER")).toBe(true);
    expect(isOfficeRole("ADMIN")).toBe(true);
    expect(isOfficeRole("TECHNICIAN")).toBe(false);
    expect(isManagerOrHigher("MANAGER")).toBe(true);
    expect(isManagerOrHigher("STAFF")).toBe(false);
  });

  it("technician scope restricts to own collected payments", () => {
    expect(paymentScopeForActor("TECHNICIAN", "u1")).toEqual({
      collectedById: "u1",
    });
    expect(paymentScopeForActor("STAFF", "u1")).toEqual({ all: true });
  });
});
