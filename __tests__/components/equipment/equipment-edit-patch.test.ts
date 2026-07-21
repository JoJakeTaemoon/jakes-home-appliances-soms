import { describe, it, expect } from "vitest";
import { buildEquipmentPatch } from "@/components/equipment/equipment-edit-modal";

const base = {
  modelId: "m1",
  siteId: null,
  serialNumber: "SN-1",
  assetCode: "WA-1",
  ownership: "COMPANY",
  installedAt: "2026-01-01",
  serviceType: "RENTAL",
  managementType: "FULL_SERVICE",
  deposit: 500000,
  monthlyFee: 150000,
  salePrice: 0,
  installFee: 0,
  inspectionCycle: 90,
  maintenanceCycle: 0,
  lastInspection: "2026-06-01",
  notes: "hello",
  customDescription: "",
};

describe("buildEquipmentPatch", () => {
  it("sends nothing when nothing changed", () => {
    expect(buildEquipmentPatch({ ...base }, base)).toEqual({});
  });

  it("sends only the changed fields", () => {
    const body = buildEquipmentPatch({ ...base, salePrice: 5_000_000, modelId: "m2" }, base);
    expect(body).toEqual({ salePrice: 5_000_000, modelId: "m2" });
  });

  it("reverts a cycle to null when set to 0", () => {
    const body = buildEquipmentPatch({ ...base, inspectionCycle: 0 }, base);
    expect(body).toEqual({ customInspectionCycleDays: null });
  });

  it("sends the cycle value when raised above 0", () => {
    const body = buildEquipmentPatch({ ...base, maintenanceCycle: 180 }, base);
    expect(body).toEqual({ customMaintenanceCycleDays: 180 });
  });

  it("clears the last-inspection override when the date is emptied", () => {
    const body = buildEquipmentPatch({ ...base, lastInspection: "" }, base);
    expect(body).toEqual({ lastInspectionAtOverride: null });
  });

  it("sends the empty string for cleared text fields (server maps to null)", () => {
    const body = buildEquipmentPatch({ ...base, notes: "" }, base);
    expect(body).toEqual({ notes: "" });
  });

  it("never sends installedAt when blanked (install date is required)", () => {
    const body = buildEquipmentPatch({ ...base, installedAt: "" }, base);
    expect(body).toEqual({});
  });
});
