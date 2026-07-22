import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), canGoBack: false }));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ back: h.back, push: h.push }),
}));
vi.mock("@/lib/nav/navigation-history", () => ({
  useNavigationHistory: () => ({ canGoBack: h.canGoBack }),
}));

import { BackButton } from "@/components/ui/back-button";

beforeEach(() => {
  h.back.mockClear();
  h.push.mockClear();
});

describe("BackButton", () => {
  it("goes back in-app history when canGoBack", () => {
    h.canGoBack = true;
    render(<BackButton fallback="/o/customers">back</BackButton>);
    fireEvent.click(screen.getByText("back"));
    expect(h.back).toHaveBeenCalledTimes(1);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("falls back to the parent route on a cold load (no in-app history)", () => {
    h.canGoBack = false;
    render(<BackButton fallback="/o/customers">back</BackButton>);
    fireEvent.click(screen.getByText("back"));
    expect(h.push).toHaveBeenCalledWith("/o/customers");
    expect(h.back).not.toHaveBeenCalled();
  });
});
