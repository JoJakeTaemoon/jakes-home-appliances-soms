import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ServiceMethodSection,
  type ServiceMethodValue,
} from "@/components/equipment/service-method-section";

// next-intl — return the raw key so assertions can match on it directly
// instead of wiring up a full NextIntlClientProvider + messages bundle.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "vi",
}));

function renderSection(value: ServiceMethodValue, onChange = vi.fn()) {
  render(<ServiceMethodSection value={value} onChange={onChange} />);
  return onChange;
}

describe("ServiceMethodSection", () => {
  it("shows only RENTAL fields for method=RENTAL", () => {
    renderSection({ method: "RENTAL", deposit: 0, monthlyRent: 0, termMonths: 36 });

    expect(screen.getByLabelText("deposit")).toBeInTheDocument();
    expect(screen.getByLabelText("monthlyRent")).toBeInTheDocument();
    expect(screen.queryByLabelText("salePrice")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("monthlyMaintenanceFee")).not.toBeInTheDocument();
  });

  it("shows only SALE fields for method=SALE (no maintenance sub-section by default)", () => {
    renderSection({ method: "SALE", hasContract: false, salePrice: 0, installFee: 0, managementType: "SELF_MANAGED" });

    expect(screen.getByLabelText("salePrice")).toBeInTheDocument();
    expect(screen.getByLabelText("installFee")).toBeInTheDocument();
    expect(screen.queryByLabelText("deposit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("monthlyRent")).not.toBeInTheDocument();
    // SELF_MANAGED (default) hides the maintenance sub-section fields.
    expect(screen.queryByLabelText("monthlyMaintenanceFee")).not.toBeInTheDocument();
    // hasContract=false hides the sale contract fields.
    expect(screen.queryByLabelText("contractNumber")).not.toBeInTheDocument();
  });

  it("shows only MAINTENANCE fields for method=MAINTENANCE, including an editable term", () => {
    renderSection({ method: "MAINTENANCE", monthlyMaintenanceFee: 0, termMonths: 36 });

    expect(screen.getByLabelText("monthlyMaintenanceFee")).toBeInTheDocument();
    expect(screen.getByLabelText("contractNumber")).toBeInTheDocument();
    expect(screen.getByLabelText("termMonths")).toHaveValue(36);
    expect(screen.queryByLabelText("salePrice")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("deposit")).not.toBeInTheDocument();
  });

  it("calls onChange with the updated termMonths when the MAINTENANCE term field changes", () => {
    const onChange = vi.fn();
    renderSection({ method: "MAINTENANCE", monthlyMaintenanceFee: 0, termMonths: 36 }, onChange);

    fireEvent.change(screen.getByLabelText("termMonths"), { target: { value: "24" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ method: "MAINTENANCE", termMonths: 24 }),
    );
  });

  it("switching the method radio swaps which fields are shown", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ServiceMethodSection
        value={{ method: "RENTAL", deposit: 0, monthlyRent: 0, termMonths: 36 }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("deposit")).toBeInTheDocument();

    fireEvent.click(screen.getByText("methodValues.SALE"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ method: "SALE", salePrice: 0, installFee: 0 }),
    );

    // Simulate the parent applying the emitted value.
    rerender(
      <ServiceMethodSection
        value={onChange.mock.calls[0][0]}
        onChange={onChange}
      />,
    );
    expect(screen.queryByLabelText("deposit")).not.toBeInTheDocument();
    expect(screen.getByLabelText("salePrice")).toBeInTheDocument();
  });

  it("reveals the maintenance sub-section when SALE managementType=FULL_SERVICE", () => {
    const value: ServiceMethodValue = {
      method: "SALE",
      hasContract: false,
      salePrice: 0,
      installFee: 0,
      managementType: "SELF_MANAGED",
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <ServiceMethodSection value={value} onChange={onChange} />,
    );
    expect(screen.queryByLabelText("monthlyMaintenanceFee")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("managementTypeValues.FULL_SERVICE"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ managementType: "FULL_SERVICE" }),
    );

    rerender(
      <ServiceMethodSection value={onChange.mock.calls[0][0]} onChange={onChange} />,
    );
    expect(screen.getByLabelText("monthlyMaintenanceFee")).toBeInTheDocument();
    expect(screen.getByLabelText("maintenanceContractDate")).toBeInTheDocument();
  });

  it("reveals the contract fields when SALE hasContract flips to true", () => {
    const value: ServiceMethodValue = {
      method: "SALE",
      hasContract: false,
      salePrice: 0,
      installFee: 0,
      managementType: "SELF_MANAGED",
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <ServiceMethodSection value={value} onChange={onChange} />,
    );
    expect(screen.queryByLabelText("contractNumber")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("contractDate")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("hasContractValues.true"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasContract: true }),
    );

    rerender(
      <ServiceMethodSection value={onChange.mock.calls[0][0]} onChange={onChange} />,
    );
    expect(screen.getByLabelText("contractNumber")).toBeInTheDocument();
    expect(screen.getByLabelText("contractDate")).toBeInTheDocument();
  });

  it("calls onChange with the updated value when a money field changes", () => {
    const onChange = vi.fn();
    renderSection({ method: "RENTAL", deposit: 0, monthlyRent: 0, termMonths: 36 }, onChange);

    fireEvent.change(screen.getByLabelText("deposit"), { target: { value: "500000" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ method: "RENTAL", deposit: 500000 }),
    );
  });

  it("hides contractNumber/contractDate/termMonths (but keeps pricing) when hideContractFields=true, across all methods", () => {
    const { rerender } = render(
      <ServiceMethodSection
        value={{ method: "RENTAL", deposit: 0, monthlyRent: 0, termMonths: 36 }}
        onChange={vi.fn()}
        hideContractFields
      />,
    );
    expect(screen.queryByLabelText("contractNumber")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("contractDate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("termMonths")).not.toBeInTheDocument();
    expect(screen.getByLabelText("deposit")).toBeInTheDocument();
    expect(screen.getByLabelText("monthlyRent")).toBeInTheDocument();

    rerender(
      <ServiceMethodSection
        value={{
          method: "SALE",
          hasContract: true,
          contractNumber: "HD-1",
          salePrice: 0,
          installFee: 0,
          managementType: "FULL_SERVICE",
          monthlyMaintenanceFee: 0,
        }}
        onChange={vi.fn()}
        hideContractFields
      />,
    );
    expect(screen.queryByLabelText("contractNumber")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("contractDate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("maintenanceContractDate")).not.toBeInTheDocument();
    expect(screen.getByLabelText("salePrice")).toBeInTheDocument();
    expect(screen.getByLabelText("installFee")).toBeInTheDocument();
    expect(screen.getByLabelText("monthlyMaintenanceFee")).toBeInTheDocument();

    rerender(
      <ServiceMethodSection
        value={{ method: "MAINTENANCE", monthlyMaintenanceFee: 0, termMonths: 36 }}
        onChange={vi.fn()}
        hideContractFields
      />,
    );
    expect(screen.queryByLabelText("contractNumber")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("contractDate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("termMonths")).not.toBeInTheDocument();
    expect(screen.getByLabelText("monthlyMaintenanceFee")).toBeInTheDocument();
  });

  it("calls onChange with the updated value when the contract number changes", () => {
    const onChange = vi.fn();
    renderSection({ method: "MAINTENANCE", monthlyMaintenanceFee: 0 }, onChange);

    fireEvent.change(screen.getByLabelText("contractNumber"), {
      target: { value: "HD-20260710/SA-KH0001" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ contractNumber: "HD-20260710/SA-KH0001" }),
    );
  });
});
