import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BillingDayEditor } from "@/components/contracts/billing-day-editor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));

const patch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  useApi: () => ({ patch }),
  ApiClientError: class extends Error {},
}));

beforeEach(() => patch.mockReset().mockResolvedValue({}));

describe("BillingDayEditor", () => {
  it("saves the day the fee is collected", async () => {
    const onSaved = vi.fn();
    render(<BillingDayEditor contractId="k1" billingDay={null} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("billingDay"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/contracts/k1", { billingDay: 25 }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("clears it back to the default when emptied", async () => {
    render(<BillingDayEditor contractId="k1" billingDay={25} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("billingDay"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/contracts/k1", { billingDay: null }));
  });

  it("does not send a day no month has", () => {
    render(<BillingDayEditor contractId="k1" billingDay={null} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("billingDay"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(patch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("billingDayInvalid");
  });
});
