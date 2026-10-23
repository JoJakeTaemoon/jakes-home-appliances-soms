/**
 * Changing the model in 장비 수정: when the unit has filters the new model
 * does not carry, ask before saving — they are dropped with the change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
  useLocale: () => "ko",
}));
const api = { get: vi.fn(), patch: vi.fn() };
vi.mock("@/lib/api/client", () => ({ useApi: () => api, ApiClientError: class extends Error {} }));
vi.mock("@/components/equipment/model-picker", () => ({
  ModelPicker: ({ onModel }: { onModel: (v: string | null) => void }) => (
    <button type="button" onClick={() => onModel("m-new")}>pick new model</button>
  ),
}));

import { EquipmentEditModal } from "@/components/equipment/equipment-edit-modal";

const equipment = {
  id: "e1", modelId: "m-old", siteId: null, serialNumber: "8967", assetCode: "MAY-000023", ownership: "COMPANY",
  installedAt: "2026-06-29T00:00:00.000Z", serviceType: "RENTAL", managementType: "FULL_SERVICE",
  deposit: null, monthlyFee: "700000", salePrice: null, installFee: null,
  customInspectionCycleDays: null, customMaintenanceCycleDays: null, lastInspectionAtOverride: null,
  notes: null, customDescription: null,
};
const onSaved = vi.fn();
const renderModal = () =>
  render(<EquipmentEditModal open onClose={() => {}} equipment={equipment} customerType="B2C" sites={[]} locale="ko" onSaved={onSaved} />);

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset().mockResolvedValue({ success: true, data: {} });
  onSaved.mockReset();
});

describe("EquipmentEditModal — model change and filters", () => {
  it("asks first when the new model drops some of the unit's filters, and saves on confirm", async () => {
    api.get.mockResolvedValue({
      success: true,
      data: { removed: [{ consumableId: "c1", sku: "FLT-000001", nameKo: "Sediment Filter (I TYPE)", nameVi: "x", nameEn: "x" }] },
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "pick new model" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/equipment/e1/model-change-preview?modelId=m-new"));
    const dialog = await screen.findByRole("dialog", { name: /filtersDropTitle/ });
    expect(dialog).toHaveTextContent("Sediment Filter (I TYPE)");
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "filtersDropConfirm" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/equipment/e1", { modelId: "m-new" }));
  });

  it("saves straight away when nothing would be dropped", async () => {
    api.get.mockResolvedValue({ success: true, data: { removed: [] } });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "pick new model" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/equipment/e1", { modelId: "m-new" }));
  });
});
