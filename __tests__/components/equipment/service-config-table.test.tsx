import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceConfigTable } from "@/components/equipment/service-config-table";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
  useLocale: () => "ko",
}));

const mockUseApiQuery = vi.fn();
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));
vi.mock("@/lib/api/client", () => ({
  useApi: () => ({ patch: vi.fn(), post: vi.fn(), del: vi.fn() }),
  ApiClientError: class extends Error {},
}));

function filterRow(over: Record<string, unknown>) {
  return {
    kind: "FILTER",
    key: `f-${Math.random()}`,
    overrideId: "o1",
    consumableId: "c1",
    name: "SED 9\"",
    sku: "SED 9\"",
    defaultCycleMonths: 90,
    userCycleMonths: null,
    effectiveCycleMonths: 90,
    quantity: 1,
    previousAt: null,
    lastAt: null,
    nextDueAt: "2015-04-01T00:00:00.000Z",
    daysRemaining: -4000,
    lastUnitPrice: null,
    status: "OVERDUE",
    ...over,
  };
}

describe("ServiceConfigTable — filters with no change on record", () => {
  it("asks for the real change date when a filter's due date only comes from the install date", () => {
    mockUseApiQuery.mockReturnValue({ data: { rows: [filterRow({}), filterRow({ name: "UF 9\"" })] } });
    render(<ServiceConfigTable equipmentId="e1" />);
    expect(screen.getByRole("status")).toHaveTextContent('missingLastWarning {"count":2}');
  });

  it("says nothing once the last change is known", () => {
    mockUseApiQuery.mockReturnValue({
      data: { rows: [filterRow({ lastAt: "2026-09-01T00:00:00.000Z", status: "NORMAL", daysRemaining: 40 })] },
    });
    render(<ServiceConfigTable equipmentId="e1" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says nothing for a new install still inside its first cycle", () => {
    mockUseApiQuery.mockReturnValue({ data: { rows: [filterRow({ status: "NORMAL", daysRemaining: 60 })] } });
    render(<ServiceConfigTable equipmentId="e1" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
