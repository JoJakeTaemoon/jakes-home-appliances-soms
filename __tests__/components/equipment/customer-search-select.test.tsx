import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomerSearchSelect } from "@/components/equipment/customer-search-select";

// next-intl — return the raw key so assertions can match on it directly
// instead of wiring up a full NextIntlClientProvider + messages bundle.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "vi",
}));

const mockUseApiPageQuery = vi.fn();
const mockUseApiQuery = vi.fn();
vi.mock("@/lib/api/hooks", () => ({
  useApiPageQuery: (...args: unknown[]) => mockUseApiPageQuery(...args),
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

const mockPost = vi.fn();
vi.mock("@/lib/api/client", () => ({
  useApi: () => ({ post: mockPost, get: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }),
  ApiClientError: class MockApiClientError extends Error {
    code = "UNKNOWN";
    status = 0;
  },
}));

const searchRow = {
  id: "cus-1",
  code: "KH0001",
  name: "홍길동",
  type: "B2C" as const,
  contacts: [
    { id: "ct-1", role: "OPS_CONTACT" as const, isPrimary: true, name: "김담당", phone1: "0901111111", email: null },
  ],
  addressStreet: "123 Le Loi",
  addressWardName: "Ben Nghe",
  addressProvinceName: "Ho Chi Minh",
};

// No OPS contact — only CONTRACT_PARTY. GET /api/customers falls back to it
// (Fix 1), so the 담당자/연락처 columns should still populate.
const cpOnlyRow = {
  id: "cus-2",
  code: "KH0002",
  name: "이순신",
  type: "B2C" as const,
  contacts: [
    { id: "ct-2", role: "CONTRACT_PARTY" as const, isPrimary: false, name: "이순신(대표)", phone1: "0902222222", email: null },
  ],
  addressStreet: "45 Nguyen Hue",
  addressWardName: "Ben Nghe",
  addressProvinceName: "Ho Chi Minh",
};

describe("CustomerSearchSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApiPageQuery.mockImplementation((url: string | null | undefined) => {
      if (url && url.includes("/api/customers?q=")) {
        return { data: { data: [searchRow, cpOnlyRow] }, isLoading: false };
      }
      return { data: undefined, isLoading: false };
    });
    mockUseApiQuery.mockImplementation((url: string | null | undefined) => {
      if (url === "/api/customers/cus-1") {
        return {
          data: { ...searchRow, equipment: [1, 2], contracts: [1], _count: { equipment: 2, contracts: 1 } },
          isLoading: false,
        };
      }
      return { data: undefined, isLoading: false };
    });
  });

  it("renders result rows after entering a query and clicking search", async () => {
    render(<CustomerSearchSelect value={null} onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("searchInput"), { target: { value: "홍길동" } });
    fireEvent.click(screen.getByText("search"));

    await waitFor(() => expect(screen.getByText("홍길동")).toBeInTheDocument());
    expect(screen.getByText("KH0001")).toBeInTheDocument();
    expect(screen.getByText("김담당")).toBeInTheDocument();
  });

  it("falls back to the CONTRACT_PARTY when a customer has no OPS contact", async () => {
    render(<CustomerSearchSelect value={null} onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("searchInput"), { target: { value: "이순신" } });
    fireEvent.click(screen.getByText("search"));

    await waitFor(() => expect(screen.getByText("이순신")).toBeInTheDocument());
    expect(screen.getByText("KH0002")).toBeInTheDocument();
    expect(screen.getByText("0902222222")).toBeInTheDocument();
  });

  it("calls onChange with the customer id when a result row is selected", async () => {
    const onChange = vi.fn();
    render(<CustomerSearchSelect value={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("searchInput"), { target: { value: "홍길동" } });
    fireEvent.click(screen.getByText("search"));
    await waitFor(() => screen.getByText("홍길동"));

    fireEvent.click(screen.getByRole("radio", { name: "홍길동" }));
    expect(onChange).toHaveBeenCalledWith("cus-1");
  });

  it("shows the selected customer's detail panel", () => {
    render(<CustomerSearchSelect value="cus-1" onChange={vi.fn()} />);
    // Detail panel renders name + code + primary contact regardless of search state.
    expect(screen.getByText("KH0001", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("김담당")).toBeInTheDocument();
  });

  it("opens the new-customer modal and calls onCreated after a successful submit", async () => {
    const onChange = vi.fn();
    mockPost.mockResolvedValue({ success: true, data: { id: "cus-new", code: "KH0002" } });

    render(<CustomerSearchSelect value={null} onChange={onChange} />);

    fireEvent.click(screen.getByText(/addNew/));
    expect(screen.getByText("title")).toBeInTheDocument(); // modal title

    fireEvent.change(screen.getByLabelText("name", { exact: false }), { target: { value: "New Co" } });
    fireEvent.change(screen.getByLabelText("phone", { exact: false }), { target: { value: "0909999999" } });
    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/api/customers", expect.objectContaining({ type: "B2C", name: "New Co", phone: "0909999999" })));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("cus-new"));
  });
});
