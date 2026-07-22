import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let currentPath = "/o/customers";
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => currentPath,
}));

import {
  NavigationHistoryProvider,
  useNavigationHistory,
} from "@/lib/nav/navigation-history";

function Probe() {
  const { canGoBack } = useNavigationHistory();
  return <span data-testid="cgb">{String(canGoBack)}</span>;
}

function renderProvider() {
  return render(
    <NavigationHistoryProvider>
      <Probe />
    </NavigationHistoryProvider>,
  );
}

describe("NavigationHistoryProvider", () => {
  it("starts with canGoBack=false on a cold load / direct link", () => {
    currentPath = "/o/equipment/123";
    renderProvider();
    expect(screen.getByTestId("cgb")).toHaveTextContent("false");
  });

  it("flips canGoBack=true after an in-app navigation", () => {
    currentPath = "/o/customers";
    const { rerender } = renderProvider();
    expect(screen.getByTestId("cgb")).toHaveTextContent("false");

    // Soft navigation to a detail page.
    currentPath = "/o/customers/abc";
    rerender(
      <NavigationHistoryProvider>
        <Probe />
      </NavigationHistoryProvider>,
    );
    expect(screen.getByTestId("cgb")).toHaveTextContent("true");
  });

  it("stays false when the path does not actually change", () => {
    currentPath = "/o/visits";
    const { rerender } = renderProvider();
    rerender(
      <NavigationHistoryProvider>
        <Probe />
      </NavigationHistoryProvider>,
    );
    expect(screen.getByTestId("cgb")).toHaveTextContent("false");
  });

  it("defaults to canGoBack=false with no provider mounted", () => {
    render(<Probe />);
    expect(screen.getByTestId("cgb")).toHaveTextContent("false");
  });
});
