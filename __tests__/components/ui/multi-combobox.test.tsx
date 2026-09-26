import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { MultiCombobox } from "@/components/ui/multi-combobox";

const OPTIONS = [
  { value: "wp", label: "정수기", description: "Máy lọc nước" },
  { value: "hc", label: "냉온정수기", description: "Máy lọc nước nóng lạnh" },
  { value: "bd", label: "비데", description: "Bồn cầu", disabled: true },
];

function Harness(props: { initial?: string[]; onCreate?: (q: string) => void }) {
  const [values, setValues] = useState<string[]>(props.initial ?? []);
  return (
    <>
      <MultiCombobox
        values={values}
        onChange={setValues}
        options={OPTIONS}
        placeholder="제품군 선택"
        ariaLabel="제품군"
        allowCreate={!!props.onCreate}
        onCreate={props.onCreate}
        createLabel={(q) => `「${q}」 추가`}
      />
      <output data-testid="values">{values.join(",")}</output>
    </>
  );
}

const open = () => fireEvent.click(screen.getByRole("combobox", { name: "제품군" }));
const values = () => screen.getByTestId("values").textContent;

describe("MultiCombobox", () => {
  it("toggles several options without closing the panel", () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole("option", { name: /^정수기/ }));
    // Panel stays open — the second pick needs no re-open.
    fireEvent.click(screen.getByRole("option", { name: /냉온정수기/ }));
    expect(values()).toBe("wp,hc");
    fireEvent.click(screen.getByRole("option", { name: /^정수기/ }));
    expect(values()).toBe("hc");
  });

  it("searches labels and descriptions, accent-insensitively", () => {
    render(<Harness />);
    open();
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "nong lanh" } });
    expect(screen.queryByRole("option", { name: /^정수기/ })).toBeNull();
    expect(screen.getByRole("option", { name: /냉온정수기/ })).toBeTruthy();
  });

  it("will not pick a disabled option, but lets an already-picked one go", () => {
    const { unmount } = render(<Harness />);
    open();
    const bidet = screen.getByRole("option", { name: /비데/ }) as HTMLButtonElement;
    expect(bidet.disabled).toBe(true);
    unmount();

    render(<Harness initial={["bd"]} />);
    // Removable from the chip…
    fireEvent.click(screen.getByRole("button", { name: "Remove 비데" }));
    expect(values()).toBe("");
  });

  it("offers an inline create row for text that matches nothing", () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);
    open();
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "제습기" } });
    fireEvent.click(screen.getByRole("option", { name: /「제습기」 추가/ }));
    expect(onCreate).toHaveBeenCalledWith("제습기");
  });
});

describe("MultiCombobox — reopening", () => {
  it("forgets the last search when the panel closes", () => {
    render(<Harness />);
    open();
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "nong lanh" } });
    expect(screen.queryByRole("option", { name: /^정수기/ })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    open();
    expect((screen.getByPlaceholderText("Search…") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("option", { name: /^정수기/ })).toBeTruthy();
  });
});

describe("MultiCombobox — inside a dialog", () => {
  it("Esc closes the panel without reaching the dialog's own Esc listener", () => {
    const dialogEsc = vi.fn();
    // A Modal listens on `document`, registered before the panel opens.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dialogEsc(); };
    document.addEventListener("keydown", onKey);
    render(<Harness />);
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialogEsc).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Search…")).toBeNull();
    // With the panel closed, Esc reaches the dialog again.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialogEsc).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", onKey);
  });
});
