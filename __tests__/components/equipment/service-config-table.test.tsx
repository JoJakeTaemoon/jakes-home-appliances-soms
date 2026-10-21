import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
const api = { patch: vi.fn(), post: vi.fn(), del: vi.fn() };
vi.mock("@/lib/api/client", () => ({
  useApi: () => api,
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

describe("ServiceConfigTable — per-row 수정 / 저장 / 취소 / 삭제", () => {
  const refetch = vi.fn().mockResolvedValue(undefined);
  const rows = [
    {
      kind: "INSPECTION", key: "insp", overrideId: null, consumableId: null, name: "INSP", sku: null,
      defaultCycleMonths: 30, userCycleMonths: null, effectiveCycleMonths: 30, quantity: 1,
      previousAt: null, lastAt: null, nextDueAt: null, daysRemaining: null, lastUnitPrice: null, status: "UNKNOWN",
    },
    filterRow({ key: "cat", sourceKind: "CATALOG", overrideId: null, consumableId: "c-cat", name: "SED", status: "NORMAL", lastAt: null, daysRemaining: 30 }),
    filterRow({ key: "ovr", sourceKind: "OVERRIDE", overrideId: "o-ovr", consumableId: "c-ovr", name: "PRE", status: "NORMAL", lastAt: "2026-09-01T00:00:00.000Z", daysRemaining: 60 }),
    filterRow({ key: "man", sourceKind: "MANUAL", overrideId: "o-man", consumableId: null, name: "UDF", status: "NORMAL", lastAt: "2026-09-01T00:00:00.000Z", daysRemaining: 60 }),
  ];
  const renderTable = () => {
    mockUseApiQuery.mockReturnValue({ data: { rows }, refetch });
    return render(<ServiceConfigTable equipmentId="e1" />);
  };
  const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
  const editRow = (name: string) => within(rowOf(name)).getByRole("button", { name: "edit" }).click();
  const confirmDelete = (name: string) => {
    fireEvent.click(within(rowOf(name)).getByRole("button", { name: "delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "delete" }));
  };

  beforeEach(() => {
    refetch.mockClear();
    api.patch.mockReset().mockResolvedValue({});
    api.post.mockReset().mockResolvedValue({});
    api.del.mockReset().mockResolvedValue({});
  });

  it("gives every row its own 수정, and every filter row 삭제", () => {
    renderTable();
    expect(screen.queryByRole("textbox")).toBeNull();
    for (const n of ["INSP", "SED", "PRE", "UDF"]) {
      expect(within(rowOf(n)).getByRole("button", { name: "edit" })).toBeInTheDocument();
    }
    expect(within(rowOf("INSP")).queryByRole("button", { name: "delete" })).toBeNull();
    expect(within(rowOf("SED")).getByRole("button", { name: "delete" })).toBeInTheDocument();
  });

  it("opens only that row and saves its columns on the row's 저장", async () => {
    renderTable();
    await waitFor(() => editRow("SED"));
    const row = rowOf("SED");
    expect(within(rowOf("PRE")).queryByLabelText(/PRE/)).toBeNull();
    fireEvent.change(within(row).getByLabelText("SED lastAt"), { target: { value: "2026-10-01" } });
    fireEvent.change(within(row).getByLabelText("SED quantity"), { target: { value: "2" } });
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/equipment/e1/consumables", {
        consumableId: "c-cat",
        quantity: 2,
        lastReplacedAtOverride: "2026-10-01",
      }),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("lets a filter added by hand be renamed", async () => {
    renderTable();
    const row = rowOf("UDF");
    await waitFor(() => editRow("UDF"));
    fireEvent.change(within(row).getByLabelText("UDF name"), { target: { value: "UDF 2" } });
    fireEvent.click(within(row).getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/equipment/e1/consumables/o-man", { customName: "UDF 2" }),
    );
  });

  it("saves the inspection row onto the unit", async () => {
    renderTable();
    await waitFor(() => editRow("INSP"));
    fireEvent.change(within(rowOf("INSP")).getByLabelText("INSP userCycle"), { target: { value: "60" } });
    fireEvent.click(within(rowOf("INSP")).getByRole("button", { name: "save" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/equipment/e1", { customInspectionCycleDays: 60 }));
  });

  it("throws the row's edits away on 취소", async () => {
    renderTable();
    await waitFor(() => editRow("PRE"));
    fireEvent.change(within(rowOf("PRE")).getByLabelText("PRE userCycle"), { target: { value: "10" } });
    fireEvent.click(within(rowOf("PRE")).getByRole("button", { name: "cancel" }));
    expect(within(rowOf("PRE")).getByRole("button", { name: "edit" })).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("deletes each kind of filter the way that kind is stored, after confirming", async () => {
    renderTable();
    confirmDelete("UDF");
    await waitFor(() => expect(api.del).toHaveBeenCalledWith("/api/equipment/e1/consumables/o-man"));
    confirmDelete("PRE");
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/equipment/e1/consumables/o-ovr", { excluded: true }));
    // A catalog filter is only taken off this unit — the model keeps it.
    confirmDelete("SED");
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/equipment/e1/consumables",
        expect.objectContaining({ consumableId: "c-cat", excluded: true }),
      ),
    );
  });

  it("does nothing when the delete is not confirmed", () => {
    renderTable();
    fireEvent.click(within(rowOf("UDF")).getByRole("button", { name: "delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "cancel" }));
    expect(api.del).not.toHaveBeenCalled();
  });
});
