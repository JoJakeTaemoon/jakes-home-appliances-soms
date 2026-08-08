import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.params),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: h.push }),
  usePathname: () => "/o/customers/c1",
}));
vi.mock("next-intl", () => ({
  useLocale: () => "ko",
  useTranslations: () => (k: string) => k,
}));
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: () => ({ data: null, refetch: vi.fn() }),
}));
vi.mock("@/components/equipment/equipment-detail-panel", () => ({
  EquipmentDetailPanel: ({ equipmentId }: { equipmentId: string }) => (
    <div data-testid="panel">{equipmentId}</div>
  ),
}));
vi.mock("@/components/equipment/equipment-edit-modal", () => ({
  EquipmentEditModal: () => null,
}));

import { EquipmentMasterDetail } from "@/components/equipment/equipment-master-detail";

const EQUIPMENT = [
  {
    id: "eq1",
    model: { modelCode: "PTS-2100", nameKo: "정수기 A", nameVi: null, nameEn: null },
    siteId: null,
    site: null,
    serialNumber: "SN-1",
    status: "ACTIVE",
    ownership: "COMPANY",
    installedAt: "2026-01-01",
  },
];

function renderMD(overrides?: Partial<React.ComponentProps<typeof EquipmentMasterDetail>>) {
  return render(
    <EquipmentMasterDetail
      customerId="c1"
      customerType="B2C"
      equipment={EQUIPMENT}
      sites={[]}
      role="ADMIN"
      onChanged={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  h.replace.mockClear();
  h.push.mockClear();
  h.params = "tab=equipment";
});

describe("EquipmentMasterDetail", () => {
  it("selecting a row writes ?tab=equipment&equipmentId to the URL", () => {
    renderMD();
    fireEvent.click(screen.getByRole("button", { name: "정수기 A" }));
    expect(h.replace).toHaveBeenCalledTimes(1);
    const url = h.replace.mock.calls[0][0] as string;
    expect(url).toContain("tab=equipment");
    expect(url).toContain("equipmentId=eq1");
  });

  it("deselects a selectedId that is not in this customer's list (deep-link guard)", () => {
    h.params = "tab=equipment&equipmentId=FOREIGN";
    renderMD();
    // The guard effect runs on mount and clears the stale id.
    expect(h.replace).toHaveBeenCalled();
    const url = h.replace.mock.calls.at(-1)![0] as string;
    expect(url).toContain("tab=equipment");
    // Deselected → the guard drops the stale equipmentId from the URL, so the
    // real app re-renders without it (mock router doesn't propagate the change).
    expect(url).not.toContain("equipmentId");
  });

  it("keeps a valid selectedId (panel renders, no deselect)", () => {
    h.params = "tab=equipment&equipmentId=eq1";
    renderMD();
    expect(screen.getByTestId("panel")).toHaveTextContent("eq1");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("hides register/edit actions when the caller cannot manage equipment", () => {
    renderMD({ role: "TECHNICIAN" });
    expect(screen.queryByText("masterDetail.register")).toBeNull();
    expect(screen.queryByText("masterDetail.edit")).toBeNull();
    // Read-only actions stay.
    expect(screen.getByText("masterDetail.detail")).toBeInTheDocument();
  });

  it("shows register + edit actions for a manager", () => {
    renderMD({ role: "MANAGER" });
    expect(screen.getByText("masterDetail.register")).toBeInTheDocument();
    expect(screen.getByText("masterDetail.edit")).toBeInTheDocument();
  });
});
