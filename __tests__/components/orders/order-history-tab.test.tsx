/**
 * Customer detail 구매 이력 / 주문 내역 — orders used to sit in PENDING forever
 * because nothing could move them. PENDING rows now carry 「전달 완료」 and
 * 「취소」, each behind a confirm, posting to PATCH /api/orders/[id].
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const { patch, refetch } = vi.hoisted(() => ({ patch: vi.fn(), refetch: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  useApi: () => ({ patch, post: vi.fn(), get: vi.fn() }),
}));

const row = (id: string, state: string) => ({
  id,
  orderNumber: `SO261015-${id}`,
  orderedAt: "2026-10-15T00:00:00.000Z",
  deliveredAt: null,
  state,
  equipment: null,
  items: [{ productKind: "CONSUMABLE", customName: null, quantity: 2, unitPrice: "150000", totalPrice: "300000", purpose: null }],
  visit: null,
});
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: () => ({ data: [row("001", "PENDING"), row("002", "DELIVERED")], refetch }),
}));

import { OrderHistoryTab } from "@/components/orders/order-history-tab";

beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue({});
});

describe("OrderHistoryTab — order state actions", () => {
  it("offers the actions on PENDING rows only", () => {
    render(<OrderHistoryTab customerId="c1" />);
    expect(screen.getAllByRole("button", { name: "actions.deliver" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "actions.cancel" })).toHaveLength(1);
  });

  it("names the product kind instead of the raw enum when a line has no custom name", () => {
    render(<OrderHistoryTab customerId="c1" />);
    expect(screen.getAllByText("kinds.CONSUMABLE").length).toBeGreaterThan(0);
    expect(screen.queryByText("CONSUMABLE")).toBeNull();
  });

  it.each([
    ["actions.deliver", "DELIVERED"],
    ["actions.cancel", "CANCELLED"],
  ])("%s confirms, then PATCHes the order to %s and reloads", async (label, state) => {
    render(<OrderHistoryTab customerId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/orders/001", { state }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it("shows the server's reason when the move is refused", async () => {
    patch.mockRejectedValueOnce(new Error("Order is DELIVERED; only a PENDING order can change state"));
    render(<OrderHistoryTab customerId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "actions.cancel" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "actions.cancel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("only a PENDING order");
  });
});
