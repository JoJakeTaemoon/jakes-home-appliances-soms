import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModelPicker } from "@/components/equipment/model-picker";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "vi",
}));

const mockUseApiPageQuery = vi.fn();
vi.mock("@/lib/api/hooks", () => ({
  useApiPageQuery: (...args: unknown[]) => mockUseApiPageQuery(...args),
}));

const brands = [{ id: "brand-1", name: "Jake's Home Appliances" }];
const categories = [{ id: "cat-1", nameKo: "정수기", nameVi: "Máy lọc nước", nameEn: "Water purifier" }];
const models = [
  {
    id: "model-1",
    modelCode: "AQ-500",
    nameKo: "AQ-500 정수기",
    nameVi: "Máy lọc nước AQ-500",
    nameEn: "AQ-500 Purifier",
    brand: { id: "brand-1", name: "Jake's Home Appliances" },
    productCategory: { id: "cat-1", nameKo: "정수기", nameVi: "Máy lọc nước", nameEn: "Water purifier" },
  },
];

function renderPicker(overrides: Partial<React.ComponentProps<typeof ModelPicker>> = {}) {
  const onBrand = vi.fn();
  const onCategory = vi.fn();
  const onModel = vi.fn();
  render(
    <ModelPicker
      brandFilter={null}
      categoryFilter={null}
      modelId={null}
      onBrand={onBrand}
      onCategory={onCategory}
      onModel={onModel}
      {...overrides}
    />,
  );
  return { onBrand, onCategory, onModel };
}

describe("ModelPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApiPageQuery.mockImplementation((url: string | null | undefined) => {
      if (url?.includes("/api/admin/products/brands")) {
        return { data: { data: brands }, isLoading: false };
      }
      if (url?.includes("/api/admin/products/categories")) {
        return { data: { data: categories }, isLoading: false };
      }
      if (url?.includes("/api/equipment-models")) {
        return { data: { data: models }, isLoading: false };
      }
      return { data: undefined, isLoading: false };
    });
  });

  it("fetches models with isActive + pageSize params", () => {
    renderPicker();
    expect(mockUseApiPageQuery).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/equipment-models\?.*isActive=true.*pageSize=200/),
    );
  });

  it("pushes brand + category filters as query params", () => {
    renderPicker({ brandFilter: "brand-1", categoryFilter: "cat-1" });
    expect(mockUseApiPageQuery).toHaveBeenCalledWith(
      expect.stringMatching(/brandId=brand-1/),
    );
    expect(mockUseApiPageQuery).toHaveBeenCalledWith(
      expect.stringMatching(/categoryId=cat-1/),
    );
  });

  it("narrows the category list to the selected brand", () => {
    renderPicker({ brandFilter: "brand-1" });
    expect(mockUseApiPageQuery).toHaveBeenCalledWith(
      expect.stringMatching(/products\/categories\?.*brandId=brand-1/),
    );
  });

  it("renders model options with name + brand · category context", async () => {
    renderPicker();
    fireEvent.click(screen.getByText("fields.modelPlaceholder"));
    await waitFor(() =>
      expect(screen.getByText("Máy lọc nước AQ-500 (Jake's Home Appliances · Máy lọc nước)")).toBeInTheDocument(),
    );
  });

  it("calls onModel with the id when a model option is selected", async () => {
    const { onModel } = renderPicker();
    fireEvent.click(screen.getByText("fields.modelPlaceholder"));
    const option = await screen.findByText("Máy lọc nước AQ-500 (Jake's Home Appliances · Máy lọc nước)");
    fireEvent.click(option);
    // Model select back-fills brand + category via the meta argument.
    expect(onModel).toHaveBeenCalledWith("model-1", {
      brandId: "brand-1",
      categoryId: "cat-1",
    });
  });

  it("calls onBrand when a brand is selected", async () => {
    const { onBrand } = renderPicker();
    fireEvent.click(screen.getByText("fields.brandPlaceholder"));
    const option = await screen.findByText("Jake's Home Appliances");
    fireEvent.click(option);
    expect(onBrand).toHaveBeenCalledWith("brand-1");
  });

  it("calls onCategory when a category is selected", async () => {
    const { onCategory } = renderPicker();
    fireEvent.click(screen.getByText("fields.categoryPlaceholder"));
    const option = await screen.findByText("Máy lọc nước");
    fireEvent.click(option);
    expect(onCategory).toHaveBeenCalledWith("cat-1");
  });

  it("localizes category + model labels to the given locale (en)", async () => {
    renderPicker({ locale: "en" });
    fireEvent.click(screen.getByText("fields.categoryPlaceholder"));
    expect(await screen.findByText("Water purifier")).toBeInTheDocument();
    fireEvent.click(screen.getByText("fields.modelPlaceholder"));
    expect(
      await screen.findByText("AQ-500 Purifier (Jake's Home Appliances · Water purifier)"),
    ).toBeInTheDocument();
  });

  // Guards the exact wiring both wizards use (register per-line + bulk-register):
  // selecting a model back-fills brand + category from the emitted meta.
  it("back-fills brand + category when a model is picked (page wiring)", async () => {
    function Harness() {
      const [brandFilter, setBrand] = useState<string | null>(null);
      const [categoryFilter, setCategory] = useState<string | null>(null);
      const [modelId, setModel] = useState<string | null>(null);
      return (
        <>
          <div data-testid="state">{`${brandFilter}|${categoryFilter}|${modelId}`}</div>
          <ModelPicker
            brandFilter={brandFilter}
            categoryFilter={categoryFilter}
            modelId={modelId}
            onBrand={(v) => {
              setBrand(v);
              setCategory(null);
              setModel(null);
            }}
            onCategory={(v) => {
              setCategory(v);
              setModel(null);
            }}
            onModel={(v, meta) => {
              setModel(v);
              if (v) {
                setBrand(meta?.brandId ?? null);
                setCategory(meta?.categoryId ?? null);
              }
            }}
          />
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("null|null|null");
    fireEvent.click(screen.getByText("fields.modelPlaceholder"));
    fireEvent.click(
      await screen.findByText("Máy lọc nước AQ-500 (Jake's Home Appliances · Máy lọc nước)"),
    );
    expect(screen.getByTestId("state")).toHaveTextContent("brand-1|cat-1|model-1");
  });
});
