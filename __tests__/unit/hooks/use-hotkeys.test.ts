import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";

function fire(key: string, target: EventTarget = window) {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useHotkeys", () => {
  it("fires the mapped handler for a function key", () => {
    const save = vi.fn();
    renderHook(() => useHotkeys({ F5: save }));
    fire("F5");
    expect(save).toHaveBeenCalledOnce();
  });

  it("fires Escape by default (allowlisted even in fields)", () => {
    const close = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    renderHook(() => useHotkeys({ Escape: close }));
    fire("Escape", input);
    expect(close).toHaveBeenCalledOnce();
  });

  it("suppresses a plain-letter shortcut while typing in an input", () => {
    const fn = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    renderHook(() => useHotkeys({ a: fn }));
    fire("a", input); // typing — suppressed
    expect(fn).not.toHaveBeenCalled();
    fire("a", document.body); // not in a field — allowed
    expect(fn).toHaveBeenCalledOnce();
  });

  it("keeps function keys live inside a field (F5=저장 from an input)", () => {
    const save = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    renderHook(() => useHotkeys({ F5: save }));
    fire("F5", input);
    expect(save).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled, and unbinds on unmount", () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => useHotkeys({ F2: fn }, { enabled: false }));
    fire("F2");
    expect(fn).not.toHaveBeenCalled();
    unmount();
    fire("F2");
    expect(fn).not.toHaveBeenCalled();
  });
});
