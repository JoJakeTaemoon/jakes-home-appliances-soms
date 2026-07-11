import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stepper } from "@/components/ui/stepper";

const steps = [
  { key: "info", label: "정보" },
  { key: "equipment", label: "장비" },
  { key: "contract", label: "계약" },
  { key: "confirm", label: "확인" },
];

describe("Stepper", () => {
  it("renders all step labels", () => {
    render(<Stepper steps={steps} current="equipment" />);
    for (const s of steps) {
      expect(screen.getByText(s.label)).toBeInTheDocument();
    }
  });

  it("emphasizes the current step and not the others", () => {
    render(<Stepper steps={steps} current="equipment" />);

    const current = screen.getByText("장비");
    expect(current.className).toContain("font-semibold");
    expect(current.className).toContain("text-[var(--brand-blue-700)]");

    const before = screen.getByText("정보");
    const after = screen.getByText("계약");
    expect(before.className).not.toContain("text-[var(--brand-blue-700)]");
    expect(after.className).not.toContain("text-[var(--brand-blue-700)]");
  });
});
