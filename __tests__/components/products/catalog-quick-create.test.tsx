import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  BrandQuickCreateModal,
  CategoryQuickCreateModal,
} from "@/components/products/catalog-quick-create";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "vi",
}));

const post = vi.fn();
// Keep the real error helpers (apiErrorText) — only the network is faked.
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  useApi: () => ({ post }),
}));

beforeEach(() => {
  post.mockReset();
});

/** The Modal renders through a portal, so query the whole document. */
function inputFor(label: string): HTMLInputElement {
  return screen.getByText(label).closest("div")!.querySelector("input")!;
}

describe("CategoryQuickCreateModal", () => {
  it("prefills every locale name from the typed text and leaves the code blank", () => {
    render(
      <CategoryQuickCreateModal initialName="Máy hút ẩm" onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(inputFor("colNameVi").value).toBe("Máy hút ẩm");
    expect(inputFor("colNameKo").value).toBe("Máy hút ẩm");
    // The server mints the code from the name — nothing to prefill, and no
    // `CATEGORY` placeholder text sitting in the box for a Korean-only name.
    expect(inputFor("colCode").value).toBe("");
  });

  it("keeps the code blank while the names are edited", () => {
    render(<CategoryQuickCreateModal initialName="x" onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(inputFor("colNameEn"), { target: { value: "Ice maker" } });
    expect(inputFor("colCode").value).toBe("");
  });

  it("keeps a hand-typed code, upper-cased", () => {
    render(<CategoryQuickCreateModal initialName="x" onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(inputFor("colCode"), { target: { value: "custom" } });
    fireEvent.change(inputFor("colNameEn"), { target: { value: "Ice maker" } });
    expect(inputFor("colCode").value).toBe("CUSTOM");
  });

  it("POSTs the category and hands the created row back", async () => {
    const created = {
      id: "cat-9",
      code: "ICE_MAKER",
      nameKo: "제빙기",
      nameVi: "Máy làm đá",
      nameEn: "Ice maker",
    };
    post.mockResolvedValue({ success: true, data: created });
    const onCreated = vi.fn();
    render(
      <CategoryQuickCreateModal initialName="Máy làm đá" onClose={vi.fn()} onCreated={onCreated} />,
    );
    fireEvent.change(inputFor("colNameKo"), { target: { value: "제빙기" } });
    fireEvent.change(inputFor("colNameEn"), { target: { value: "Ice maker" } });
    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(post).toHaveBeenCalledWith("/api/admin/products/categories", {
      // Blank — the route allocates a free code from the name.
      code: undefined,
      nameKo: "제빙기",
      nameVi: "Máy làm đá",
      nameEn: "Ice maker",
    });
  });

  it("surfaces the API error and keeps the popup open", async () => {
    post.mockRejectedValue(new Error("Category code ICE_MAKER already exists"));
    const onCreated = vi.fn();
    render(<CategoryQuickCreateModal initialName="Ice maker" onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.click(screen.getByText("save"));

    await waitFor(() =>
      expect(screen.getByText("Category code ICE_MAKER already exists")).toBeInTheDocument(),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("BrandQuickCreateModal", () => {
  it("POSTs the typed brand name and hands the created row back", async () => {
    const created = { id: "brand-9", name: "Coway" };
    post.mockResolvedValue({ success: true, data: created });
    const onCreated = vi.fn();
    render(<BrandQuickCreateModal initialName="Coway" onClose={vi.fn()} onCreated={onCreated} />);
    expect(inputFor("colBrand").value).toBe("Coway");
    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(post).toHaveBeenCalledWith("/api/admin/products/brands", { name: "Coway" });
  });
});
