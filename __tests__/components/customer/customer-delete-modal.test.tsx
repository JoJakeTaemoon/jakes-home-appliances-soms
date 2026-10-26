/**
 * 고객 삭제 modal: shows what is attached by group, lets each group move to
 * another customer or go with it, and only deletes once the code is typed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
  useLocale: () => "ko",
}));
const api = { post: vi.fn() };
vi.mock("@/lib/api/client", () => ({ useApi: () => api, ApiClientError: class extends Error {} }));
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: (url: string | null) => {
    if (!url) return { data: undefined, isLoading: false };
    if (url.includes("delete-preview")) {
      return {
        data: {
          customer: { id: "c1", code: "KH00001", name: "Old Co", type: "B2B" },
          groups: {
            operations: { equipment: 3, contracts: 1, visits: 4, payments: 12 },
            contacts: { contacts: 2, sites: 1 },
            requests: { serviceRequests: 0, orders: 0 },
            records: { notificationLogs: 5, documents: 0 },
          },
        },
        isLoading: false,
      };
    }
    return {
      data: [
        { id: "c1", code: "KH00001", name: "Old Co" },
        { id: "c2", code: "KH00002", name: "New Co" },
      ],
      isLoading: false,
    };
  },
}));

import { CustomerDeleteModal } from "@/components/customer/customer-delete-modal";

const onDeleted = vi.fn();
const renderModal = () => render(<CustomerDeleteModal open onClose={() => {}} customerId="c1" onDeleted={onDeleted} />);
const group = (key: string) => screen.getByRole("group", { name: new RegExp(`groups\\.${key}`) });

beforeEach(() => {
  api.post.mockReset().mockResolvedValue({ success: true, data: { deletedId: "c1" } });
  onDeleted.mockReset();
});

describe("CustomerDeleteModal", () => {
  it("shows the counts per group and offers no choice for an empty group", () => {
    renderModal();
    expect(group("operations")).toHaveTextContent('count.payments {"count":12}');
    expect(group("contacts")).toHaveTextContent('count.sites {"count":1}');
    expect(within(group("requests")).queryByRole("radio")).toBeNull();
  });

  it("deletes everything once the code is typed", async () => {
    renderModal();
    const submit = screen.getByRole("button", { name: "submit" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/confirmLabel/), { target: { value: "KH00001" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/customers/c1/delete", {
        actions: { operations: "DELETE", contacts: "DELETE", requests: "DELETE", records: "DELETE" },
        targetCustomerId: null,
        confirmCode: "KH00001",
      }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("needs a target customer (never itself) before moving a group", async () => {
    renderModal();
    fireEvent.click(within(group("operations")).getByRole("radio", { name: "move" }));
    fireEvent.change(screen.getByLabelText(/confirmLabel/), { target: { value: "KH00001" } });
    const submit = screen.getByRole("button", { name: "submit" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("targetSearch"), { target: { value: "Co" } });
    expect(screen.queryByRole("option", { name: /KH00001/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /KH00002/ }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/customers/c1/delete", {
        actions: { operations: "MOVE", contacts: "DELETE", requests: "DELETE", records: "DELETE" },
        targetCustomerId: "c2",
        confirmCode: "KH00001",
      }),
    );
  });

  it("warns that moved equipment loses its site when the sites are deleted", () => {
    renderModal();
    expect(screen.queryByText("hintSiteDropped")).toBeNull();
    fireEvent.click(within(group("operations")).getByRole("radio", { name: "move" }));
    expect(screen.getByText("hintSiteDropped")).toBeInTheDocument();
  });
});
