/**
 * Portal screens used to print raw enums (ACTIVE, OVERDUE_D7, COMPANY), a
 * hardcoded "Loading…", and "— / —" for off-catalog equipment.
 * next-intl is mocked to echo `namespace.key`, so a translated label shows up
 * as its key and a raw enum shows up bare.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EquipmentListClient } from "@/app/[locale]/equipment/equipment-list-client";
import { PortalPaymentsClient } from "@/app/[locale]/payments/client";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "ko",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/providers/customer-auth-provider", () => ({
  useCustomerAuth: () => ({ accessToken: "tok" }),
}));
const useApiQuery = vi.fn();
vi.mock("@/lib/api/hooks", () => ({ useApiQuery: (url: string) => useApiQuery(url) }));

beforeEach(() => {
  useApiQuery.mockReset();
  vi.unstubAllGlobals();
});

describe("portal equipment list", () => {
  it("labels off-catalog units by description and translates the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            equipment: [
              {
                id: "e1",
                serialNumber: "SN-1",
                status: "TERMINATED",
                ownership: "CUSTOMER",
                installedAt: null,
                model: null,
                customDescription: "Máy lọc Kangaroo cũ",
                site: null,
              },
            ],
          },
        }),
      }),
    );
    render(<EquipmentListClient />);
    await waitFor(() => expect(screen.getByText("Máy lọc Kangaroo cũ")).toBeInTheDocument());
    expect(screen.getByText("equipment.statusValues.TERMINATED")).toBeInTheDocument();
    expect(screen.queryByText("TERMINATED")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("portal payments", () => {
  it("uses the translated loading text", () => {
    useApiQuery.mockReturnValue({ isLoading: true, data: undefined });
    render(<PortalPaymentsClient />);
    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("translates the payment state", () => {
    useApiQuery.mockReturnValue({
      isLoading: false,
      data: {
        outstanding: 100000,
        payments: [
          {
            id: "p1",
            state: "OVERDUE_D7",
            expectedAmount: "100000",
            actualAmount: "0",
            dueDate: null,
            collectedAt: null,
            daysOverdue: 9,
            contract: null,
          },
        ],
      },
    });
    render(<PortalPaymentsClient />);
    expect(screen.getByText("payments.states.OVERDUE_D7")).toBeInTheDocument();
    expect(screen.queryByText("OVERDUE_D7")).not.toBeInTheDocument();
  });
});
