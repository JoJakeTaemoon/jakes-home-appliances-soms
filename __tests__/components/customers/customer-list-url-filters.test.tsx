/**
 * The customer list keeps its filters, page and sort in the address, so
 * opening a customer and pressing 뒤로 lands back on the same filtered list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/o/customers",
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));
const pageQuery = vi.fn();
vi.mock("@/lib/api/hooks", () => ({
  useApiPageQuery: (url: string) => {
    pageQuery(url);
    return { data: { data: [], pagination: { total: 0 } }, isLoading: false };
  },
  useApiQuery: () => ({ data: null, isLoading: false }),
}));

import CustomersPage from "@/app/o/[locale]/(dashboard)/customers/page";

const lastApiUrl = () => new URL(`http://x${pageQuery.mock.calls.at(-1)![0]}`).searchParams;

beforeEach(() => {
  replace.mockReset();
  pageQuery.mockReset();
});

describe("customer list filters live in the URL", () => {
  it("starts from the filters, page and sort in the address", () => {
    search = "status=ACTIVE&type=B2C&contractState=ACTIVE&region=HCMC-D1&q=kang&page=2&sortBy=name&sortDir=desc";
    render(<CustomersPage />);
    const p = lastApiUrl();
    expect(p.get("status")).toBe("ACTIVE");
    expect(p.get("type")).toBe("B2C");
    expect(p.get("contractState")).toBe("ACTIVE");
    expect(p.get("region")).toBe("HCMC-D1");
    expect(p.get("q")).toBe("kang");
    expect(p.get("page")).toBe("2");
    expect(p.get("sortBy")).toBe("name");
    expect(p.get("sortDir")).toBe("desc");
    // Already in the address — nothing to write back.
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores values it would never have written", () => {
    search = "status=WHATEVER&type=B2X&page=-3";
    render(<CustomersPage />);
    const p = lastApiUrl();
    expect(p.get("status")).toBeNull();
    expect(p.get("type")).toBeNull();
    expect(p.get("page")).toBe("1");
  });

  it("writes a filter change back to the address", async () => {
    search = "status=ACTIVE";
    render(<CustomersPage />);
    fireEvent.change(screen.getByPlaceholderText("regionPlaceholder"), { target: { value: "HN" } });
    await waitFor(() =>
      expect(replace).toHaveBeenLastCalledWith("/o/customers?status=ACTIVE&region=HN", { scroll: false }),
    );
  });

  it("clears the address on 필터 초기화", async () => {
    search = "status=ACTIVE&type=B2C";
    render(<CustomersPage />);
    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith("/o/customers", { scroll: false }));
  });
});
