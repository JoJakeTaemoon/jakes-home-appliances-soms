import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomerDataChecksBanner } from "@/components/customer/data-checks-banner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const mockUseApiQuery = vi.fn();
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

const EMPTY = { opsToReview: [], contractsWithoutFee: [], equipmentWithoutFilterDate: [] };

describe("CustomerDataChecksBanner", () => {
  it("stays out of the way when there is nothing to check", () => {
    mockUseApiQuery.mockReturnValue({ data: EMPTY });
    const { container } = render(<CustomerDataChecksBanner customerId="c1" onOpenContacts={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks staff to confirm the operations contact and opens the contacts tab", () => {
    mockUseApiQuery.mockReturnValue({ data: { ...EMPTY, opsToReview: [{ id: "k1", name: "Lan" }] } });
    const onOpenContacts = vi.fn();
    render(<CustomerDataChecksBanner customerId="c1" onOpenContacts={onOpenContacts} />);
    expect(screen.getByText(/opsToReview/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "openContacts" }));
    expect(onOpenContacts).toHaveBeenCalled();
  });

  it("links each contract with no amount and each unit with no filter date", () => {
    mockUseApiQuery.mockReturnValue({
      data: {
        ...EMPTY,
        contractsWithoutFee: [{ id: "k9", contractNumber: "HD-20140101/SA-KH00001" }],
        equipmentWithoutFilterDate: [{ id: "e7", assetCode: "MAY-000007", modelCode: "PTS-2100" }],
      },
    });
    render(<CustomerDataChecksBanner customerId="c1" onOpenContacts={() => {}} />);
    expect(screen.getByRole("link", { name: "HD-20140101/SA-KH00001" })).toHaveAttribute("href", "/o/contracts/k9");
    expect(screen.getByRole("link", { name: /MAY-000007/ })).toHaveAttribute("href", "/o/equipment/e7");
  });
});
