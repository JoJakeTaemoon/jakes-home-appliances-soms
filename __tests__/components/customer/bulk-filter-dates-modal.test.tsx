/**
 * One form for the last filter change across many units: pick the units (a
 * whole model at once), give each filter a date, save once.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/ko.json";

const api = { post: vi.fn() };
vi.mock("@/lib/api/client", () => ({
  useApi: () => api,
  ApiClientError: class extends Error {},
}));
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: () => ({
    data: {
      consumables: [
        { id: "fA", sku: "FA", nameKo: "필터A", nameVi: "A", nameEn: "A" },
        { id: "fB", sku: "FB", nameKo: "필터B", nameVi: "B", nameEn: "B" },
      ],
      units: [
        { id: "u1", assetCode: "MAY-000001", model: { id: "m1", modelCode: "M1", nameKo: "모델1", nameVi: null, nameEn: null }, filters: [{ consumableId: "fA", lastReplacedAt: null }] },
        { id: "u2", assetCode: "MAY-000002", model: { id: "m1", modelCode: "M1", nameKo: "모델1", nameVi: null, nameEn: null }, filters: [{ consumableId: "fA", lastReplacedAt: null }] },
        { id: "u3", assetCode: "MAY-000001", model: { id: "m2", modelCode: "M2", nameKo: "모델2", nameVi: null, nameEn: null }, filters: [{ consumableId: "fB", lastReplacedAt: null }] },
      ],
    },
    isLoading: false,
  }),
}));
// The calendar popover is not what is under test here.
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) => (
    <input aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { BulkFilterDatesModal } from "@/components/customer/bulk-filter-dates-modal";

const renderModal = (preselectIds?: string[]) => {
  const onSaved = vi.fn();
  render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <BulkFilterDatesModal open onClose={() => {}} customerId="c1" preselectIds={preselectIds} onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
  return onSaved;
};

beforeEach(() => {
  api.post.mockReset().mockResolvedValue({ success: true, data: { units: 2, created: 2, updated: 0, skipped: 0 } });
});

describe("BulkFilterDatesModal", () => {
  it("selects a whole model with one click and saves one date for all its units", async () => {
    const onSaved = renderModal();
    fireEvent.click(screen.getByRole("checkbox", { name: /모델1/ }));
    // Only the filters of the chosen units are offered.
    expect(screen.queryByLabelText("필터B")).toBeNull();
    fireEvent.change(screen.getByLabelText("필터A"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/customers/c1/equipment-filters", {
        equipmentIds: ["u1", "u2"],
        entries: [{ consumableId: "fA", lastReplacedAt: "2026-09-01" }],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toContain("2대 저장");
  });

  it("starts from the preselected units and fills every filter from one date", async () => {
    renderModal(["u1", "u3"]);
    fireEvent.change(screen.getByLabelText(messages.customers.bulkFilterDates.applyAllLabel), { target: { value: "2026-08-15" } });
    fireEvent.click(screen.getByRole("button", { name: messages.customers.bulkFilterDates.applyAll }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/customers/c1/equipment-filters", {
        equipmentIds: ["u1", "u3"],
        entries: [
          { consumableId: "fA", lastReplacedAt: "2026-08-15" },
          { consumableId: "fB", lastReplacedAt: "2026-08-15" },
        ],
      }),
    );
  });

  it("will not save without a unit and a date", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });
});
