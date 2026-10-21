import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ServiceConfigEditor,
  type ServiceConfigValue,
} from "@/components/equipment/service-config-editor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "vi",
}));

const mockUseApiQuery = vi.fn();
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

const CONSUMABLE = {
  consumableId: "cons-1",
  sku: "SKU-1",
  name: { ko: "필터A", vi: "Lõi lọc A", en: "Filter A" },
  replaceEveryDays: 180,
  cleanEveryDays: null,
  cleanOnEveryVisit: false,
  defaultQuantity: 2,
  retailPrice: 100000,
};

function renderEditor(overrides: Partial<React.ComponentProps<typeof ServiceConfigEditor>> = {}) {
  const onChange = vi.fn();
  const value: ServiceConfigValue = overrides.value ?? { inspectionCycleDays: 30, filters: [] };
  const utils = render(
    <ServiceConfigEditor
      modelId="model-1"
      installDate="2026-01-01"
      inspectionDisabled={false}
      value={value}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

describe("ServiceConfigEditor", () => {
  it("initializes a filter row from the model's consumables", () => {
    mockUseApiQuery.mockReturnValue({ data: [CONSUMABLE] });
    const { onChange } = renderEditor();

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            consumableId: "cons-1",
            useCycleDays: 180,
            quantity: 2,
          }),
        ],
      }),
    );
  });

  it("renders 사용주기/수량/다음예정일 for the seeded row", () => {
    mockUseApiQuery.mockReturnValue({ data: [CONSUMABLE] });
    renderEditor({
      value: {
        inspectionCycleDays: 30,
        filters: [
          {
            consumableId: "cons-1",
            name: "Lõi lọc A",
            baseCycleDays: 180,
            useCycleDays: 180,
            quantity: 2,
          },
        ],
      },
    });

    expect(screen.getByLabelText("useCycle")).toHaveValue(180);
    expect(screen.getByLabelText("quantity")).toHaveValue(2);
    // No lastReplacedAt → the 최근교체일 input shows the install date, and
    // installDate 2026-01-01 + 180 days = 2026-06-30; locale is "vi" (mocked
    // above) so dates render DD/MM/YYYY per project convention.
    expect(screen.getByLabelText("lastReplacedAt")).toHaveValue("2026-01-01");
    expect(screen.getByText("30/06/2026")).toBeInTheDocument();
  });

  it("recomputes 다음예정일 when 사용주기 changes", () => {
    mockUseApiQuery.mockReturnValue({ data: [CONSUMABLE] });
    const { onChange } = renderEditor({
      value: {
        inspectionCycleDays: 30,
        filters: [
          {
            consumableId: "cons-1",
            name: "Lõi lọc A",
            baseCycleDays: 180,
            useCycleDays: 180,
            quantity: 2,
          },
        ],
      },
    });
    onChange.mockClear();

    fireEvent.change(screen.getByLabelText("useCycle"), { target: { value: "90" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ useCycleDays: 90 })],
      }),
    );
  });

  it("adds a custom filter row via + 필터 추가", () => {
    mockUseApiQuery.mockReturnValue({ data: [] });
    const { onChange } = renderEditor({ value: { inspectionCycleDays: 30, filters: [] } });

    fireEvent.click(screen.getByText("addFilter"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            customName: "",
            baseCycleDays: null,
            useCycleDays: 30,
            quantity: 1,
          }),
        ],
      }),
    );
  });

  it("removes a filter row", () => {
    mockUseApiQuery.mockReturnValue({ data: [] });
    const { onChange } = renderEditor({
      value: {
        inspectionCycleDays: 30,
        filters: [
          {
            consumableId: "cons-1",
            name: "Lõi lọc A",
            baseCycleDays: 180,
            useCycleDays: 180,
            quantity: 2,
          },
        ],
      },
    });

    fireEvent.click(screen.getByLabelText("removeFilter"));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ filters: [] }));
  });

  it("disables the inspection cycle input when inspectionDisabled", () => {
    mockUseApiQuery.mockReturnValue({ data: [] });
    renderEditor({ inspectionDisabled: true });

    expect(screen.getByLabelText("inspectionCycle")).toBeDisabled();
    expect(screen.getByText("inspectionDisabledHint")).toBeInTheDocument();
  });

  const FILTER_A = {
    consumableId: "cons-1",
    name: "Lõi lọc A",
    baseCycleDays: 180,
    useCycleDays: 180,
    quantity: 2,
  };
  const FILTER_B = {
    consumableId: "cons-2",
    name: "Lõi lọc B",
    baseCycleDays: 90,
    useCycleDays: 90,
    quantity: 1,
  };

  it("editing 최근교체일 reports lastReplacedAt and counts 다음예정일 from it", () => {
    mockUseApiQuery.mockReturnValue({ data: [] });
    const { onChange, rerender } = renderEditor({
      value: { inspectionCycleDays: 30, filters: [FILTER_A] },
    });

    fireEvent.change(screen.getByLabelText("lastReplacedAt"), {
      target: { value: "2025-12-01" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ consumableId: "cons-1", lastReplacedAt: "2025-12-01" })],
      }),
    );

    rerender(
      <ServiceConfigEditor
        modelId="model-1"
        installDate="2026-01-01"
        inspectionDisabled={false}
        value={{ inspectionCycleDays: 30, filters: [{ ...FILTER_A, lastReplacedAt: "2025-12-01" }] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("lastReplacedAt")).toHaveValue("2025-12-01");
    // 2025-12-01 + 180 days = 2026-05-30 (not the install-date-based 30/06/2026).
    expect(screen.getByText("30/05/2026")).toBeInTheDocument();
    expect(screen.queryByText("30/06/2026")).not.toBeInTheDocument();
  });

  it("clearing 최근교체일 falls back to the install date (lastReplacedAt=null)", () => {
    mockUseApiQuery.mockReturnValue({ data: [] });
    const { onChange } = renderEditor({
      value: { inspectionCycleDays: 30, filters: [{ ...FILTER_A, lastReplacedAt: "2025-12-01" }] },
    });
    fireEvent.change(screen.getByLabelText("lastReplacedAt"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [expect.objectContaining({ lastReplacedAt: null })] }),
    );
  });

  it("「모든 필터에 같은 날짜」 sets lastReplacedAt on every row", () => {
    mockUseApiQuery.mockReturnValue({ data: [] });
    const { onChange } = renderEditor({
      value: { inspectionCycleDays: 30, filters: [FILTER_A, FILTER_B] },
    });

    fireEvent.change(screen.getByLabelText("applyAllLabel"), { target: { value: "2025-10-01" } });
    fireEvent.click(screen.getByText("applyAll"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({ consumableId: "cons-1", lastReplacedAt: "2025-10-01" }),
          expect.objectContaining({ consumableId: "cons-2", lastReplacedAt: "2025-10-01" }),
        ],
      }),
    );
  });
});
