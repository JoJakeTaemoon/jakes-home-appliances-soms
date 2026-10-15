/**
 * Payment detail — an overdue row used to offer only 상각 (write-off), so a
 * customer who finally paid could not be recorded. 부분 결제 must now show
 * for OVERDUE_D7/14/30 too, start at the full amount due (so a full
 * settlement is one click) and post to the same carry-over endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "pay-1" }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ui/back-button", () => ({ BackButton: () => null }));
vi.mock("@/lib/nav/breadcrumb-context", () => ({ BreadcrumbLabel: () => null }));

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({
  useApi: () => ({ post, patch: vi.fn(), get: vi.fn() }),
}));
let role = "STAFF";
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => ({ user: { role } }) }));

let payment: Record<string, unknown> = {};
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: () => ({ data: payment, isLoading: false, refetch: vi.fn() }),
}));

import PaymentDetailPage from "@/app/o/[locale]/(dashboard)/payments/[id]/page";

function makePayment(state: string) {
  return {
    id: "pay-000000000001",
    state,
    method: "BANK_TRANSFER",
    expectedAmount: "500000",
    actualAmount: "0",
    carryoverAmount: "0",
    dueDate: "2026-09-01T00:00:00.000Z",
    collectedAt: null,
    handedOverAt: null,
    reconciledAt: null,
    daysOverdue: 40,
    reference: null,
    notes: null,
    customer: { id: "c1", code: "KH00001", name: "Acme", type: "B2C", taxCode: null },
    contract: null,
    visit: null,
    collectedBy: null,
    collectedById: null,
    taxInvoice: null,
    documents: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  role = "STAFF";
  post.mockResolvedValue({});
});

describe("PaymentDetailPage — overdue rows", () => {
  it.each(["OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"])(
    "offers 부분 결제 on a %s row and records the full amount by default",
    async (state) => {
      payment = makePayment(state);
      render(<PaymentDetailPage />);
      fireEvent.click(screen.getByRole("button", { name: "detail.partial" }));

      const dialog = await screen.findByRole("dialog");
      const amount = dialog.querySelector("input") as HTMLInputElement;
      expect(amount.value).toBe("500.000");

      const submit = Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "detail.partial",
      ) as HTMLButtonElement;
      fireEvent.click(submit);
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith("/api/payments/pay-1/partial", { partialAmount: 500_000 }),
      );
    },
  );

  it("still hides it on settled rows", () => {
    payment = makePayment("RECONCILED");
    render(<PaymentDetailPage />);
    expect(screen.queryByRole("button", { name: "detail.partial" })).toBeNull();
  });
});
