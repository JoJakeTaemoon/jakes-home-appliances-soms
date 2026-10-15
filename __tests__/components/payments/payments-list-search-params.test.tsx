/**
 * The dashboard 「연체 결제」 banner links to /o/payments?overdueOnly=true.
 * The list used to ignore the query string and show every payment; the
 * filters now start from the URL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));
let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const urls: string[] = [];
vi.mock("@/lib/api/hooks", () => ({
  useApiPageQuery: (url: string) => {
    urls.push(url);
    return { data: { data: [], pagination: { total: 0 } }, isLoading: false };
  },
}));

import PaymentsListPage from "@/app/o/[locale]/(dashboard)/payments/page";

const checkbox = (label: string) =>
  screen.getByText(label).closest("label")!.querySelector("input") as HTMLInputElement;

beforeEach(() => {
  urls.length = 0;
});

describe("PaymentsListPage — filters from the URL", () => {
  it("starts with 연체만 on when the banner link says overdueOnly=true", () => {
    search = "overdueOnly=true";
    render(<PaymentsListPage />);
    expect(checkbox("filterOverdue").checked).toBe(true);
    expect(urls.at(-1)).toContain("overdueOnly=true");
  });

  it("also honours pendingHandover, state and method", () => {
    search = "pendingHandover=true&state=COLLECTED&method=CASH";
    render(<PaymentsListPage />);
    expect(checkbox("filterPendingHandover").checked).toBe(true);
    const url = urls.at(-1)!;
    expect(url).toContain("pendingHandover=true");
    expect(url).toContain("state=COLLECTED");
    expect(url).toContain("method=CASH");
  });

  it("ignores values that are not real states or methods", () => {
    search = "state=BOGUS&method=BITCOIN";
    render(<PaymentsListPage />);
    const url = urls.at(-1)!;
    expect(url).not.toContain("state=");
    expect(url).not.toContain("method=");
    expect(checkbox("filterOverdue").checked).toBe(false);
  });
});
