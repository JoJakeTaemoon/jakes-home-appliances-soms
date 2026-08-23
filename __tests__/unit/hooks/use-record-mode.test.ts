import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecordMode } from "@/lib/hooks/use-record-mode";

interface Row { id: string; name: string }
const A: Row = { id: "a", name: "A" };
const B: Row = { id: "b", name: "B" };

describe("useRecordMode", () => {
  it("starts in empty view", () => {
    const { result } = renderHook(() => useRecordMode<Row>());
    expect(result.current.mode).toBe("view");
    expect(result.current.selected).toBeNull();
    expect(result.current.isEditing).toBe(false);
  });

  it("select → view with the row; startEdit → edit", () => {
    const { result } = renderHook(() => useRecordMode<Row>());
    act(() => result.current.select(A));
    expect(result.current.selected).toBe(A);
    expect(result.current.mode).toBe("view");
    act(() => result.current.startEdit());
    expect(result.current.mode).toBe("edit");
    expect(result.current.isEditing).toBe(true);
  });

  it("startEdit is a no-op when nothing is selected", () => {
    const { result } = renderHook(() => useRecordMode<Row>());
    act(() => result.current.startEdit());
    expect(result.current.mode).toBe("view");
  });

  it("startCreate clears selection and enters create; cancel returns to view", () => {
    const { result } = renderHook(() => useRecordMode<Row>());
    act(() => result.current.select(A));
    act(() => result.current.startCreate());
    expect(result.current.selected).toBeNull();
    expect(result.current.mode).toBe("create");
    act(() => result.current.cancel());
    expect(result.current.mode).toBe("view");
  });

  it("saved(row) returns to view and keeps the saved row selected", () => {
    const { result } = renderHook(() => useRecordMode<Row>());
    act(() => result.current.startCreate());
    act(() => result.current.saved(B));
    expect(result.current.mode).toBe("view");
    expect(result.current.selected).toBe(B);
  });

  it("formKey bumps on every transition (remounts the form)", () => {
    const { result } = renderHook(() => useRecordMode<Row>());
    const k0 = result.current.formKey;
    act(() => result.current.select(A));
    act(() => result.current.startCreate());
    act(() => result.current.cancel());
    expect(result.current.formKey).toBeGreaterThan(k0);
  });
});
