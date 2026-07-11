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

const brands = [{ id: "brand-1", name: "Seoul Aqua" }];
const categories = [{ id: "cat-1", nameKo: "정수기", nameVi: "Máy lọc nước", nameEn: "Water purifier" }];
const models = [
  {
    id: "model-1",
    modelCode: "AQ-500",
    nameKo: "AQ-500 정수기",
    nameVi: "Máy lọc nước AQ-500",
    nameEn: "AQ-500 Purifier",
    brand: { id: "brand-1", name: "Seoul Aqua" },
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

  it("renders model options with name + brand · category context", async () => {
    renderPicker();
    fireEvent.click(screen.getByText("fields.modelPlaceholder"));
    await waitFor(() =>
      expect(screen.getByText("Máy lọc nước AQ-500 (Seoul Aqua · 정수기)")).toBeInTheDocument(),
    );
  });

  it("calls onModel with the id when a model option is selected", async () => {
    const { onModel } = renderPicker();
    fireEvent.click(screen.getByText("fields.modelPlaceholder"));
    const option = await screen.findByText("Máy lọc nước AQ-500 (Seoul Aqua · 정수기)");
    fireEvent.click(option);
    expect(onModel).toHaveBeenCalledWith("model-1");
  });

  it("calls onBrand when a brand is selected", async () => {
    const { onBrand } = renderPicker();
    fireEvent.click(screen.getByText("fields.brandPlaceholder"));
    const option = await screen.findByText("Seoul Aqua");
    fireEvent.click(option);
    expect(onBrand).toHaveBeenCalledWith("brand-1");
  });

  it("calls onCategory when a category is selected", async () => {
    const { onCategory } = renderPicker();
    fireEvent.click(screen.getByText("fields.categoryPlaceholder"));
    const option = await screen.findByText("정수기");
    fireEvent.click(option);
    expect(onCategory).toHaveBeenCalledWith("cat-1");
  });
});
