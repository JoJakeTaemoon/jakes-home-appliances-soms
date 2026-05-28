import { describe, it, expect } from "vitest";
import {
  canCreateCustomer,
  canDeactivateCustomer,
  canReactivateCustomer,
  canEditContractParty,
  canManageEquipmentModel,
  canManageSite,
  canDeactivateSite,
  canViewCustomer,
} from "@/lib/customers/access";

describe("customer access policy", () => {
  it("office roles can view + create + update", () => {
    for (const role of ["ADMIN", "MANAGER", "STAFF"]) {
      expect(canViewCustomer(role)).toBe(true);
      expect(canCreateCustomer(role)).toBe(true);
      expect(canManageSite(role)).toBe(true);
    }
  });

  it("TECHNICIAN cannot view customers (Phase 2)", () => {
    expect(canViewCustomer("TECHNICIAN")).toBe(false);
    expect(canCreateCustomer("TECHNICIAN")).toBe(false);
  });

  it("STAFF cannot deactivate / reactivate / edit contract party / manage models", () => {
    expect(canDeactivateCustomer("STAFF")).toBe(false);
    expect(canReactivateCustomer("STAFF")).toBe(false);
    expect(canEditContractParty("STAFF")).toBe(false);
    expect(canManageEquipmentModel("STAFF")).toBe(false);
    expect(canDeactivateSite("STAFF")).toBe(false);
  });

  it("MANAGER can deactivate but not reactivate", () => {
    expect(canDeactivateCustomer("MANAGER")).toBe(true);
    expect(canReactivateCustomer("MANAGER")).toBe(false);
    expect(canEditContractParty("MANAGER")).toBe(true);
    expect(canManageEquipmentModel("MANAGER")).toBe(true);
    expect(canDeactivateSite("MANAGER")).toBe(true);
  });

  it("ADMIN can do everything", () => {
    expect(canDeactivateCustomer("ADMIN")).toBe(true);
    expect(canReactivateCustomer("ADMIN")).toBe(true);
    expect(canEditContractParty("ADMIN")).toBe(true);
    expect(canManageEquipmentModel("ADMIN")).toBe(true);
  });
});
