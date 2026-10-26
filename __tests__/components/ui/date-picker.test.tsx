/**
 * DatePicker takes the keyboard as well as the calendar: digits are masked
 * into the locale's date shape as they are typed (ko/en 2026-10-26, vi
 * 26/10/2026) and a complete, real, in-range date is committed at once.
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ko from "@/messages/ko.json";
import viMsgs from "@/messages/vi.json";
import { DatePicker } from "@/components/ui/date-picker";

function Harness({ initial = "", onChange, locale = "ko", max }: { initial?: string; onChange: (v: string) => void; locale?: "ko" | "vi"; max?: string }) {
  const [v, setV] = useState(initial);
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "vi" ? viMsgs : ko}>
      <DatePicker value={v} onChange={(x) => { setV(x); onChange(x); }} ariaLabel="설치일" max={max} />
    </NextIntlClientProvider>
  );
}
const box = () => screen.getByLabelText("설치일") as HTMLInputElement;

describe("DatePicker — keyboard entry", () => {
  it("masks typed digits into YYYY-MM-DD and commits a complete date", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(box(), { target: { value: "202610" } });
    expect(box().value).toBe("2026-10");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(box(), { target: { value: "20261026" } });
    expect(box().value).toBe("2026-10-26");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-26");
  });

  it("uses DD/MM/YYYY in Vietnamese", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} locale="vi" />);
    fireEvent.change(box(), { target: { value: "26102026" } });
    expect(box().value).toBe("26/10/2026");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-26");
  });

  it("accepts a pasted date with separators", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(box(), { target: { value: "2026.10.26" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-10-26");
  });

  it("flags a date that does not exist, and puts the old value back on leaving", () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-01-05" onChange={onChange} />);
    expect(box().value).toBe("2026-01-05");
    fireEvent.change(box(), { target: { value: "20261340" } });
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box());
    expect(box().value).toBe("2026-01-05");
  });

  it("refuses a date past max", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} max="2026-10-26" />);
    fireEvent.change(box(), { target: { value: "20261027" } });
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the value when the box is emptied", () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-01-05" onChange={onChange} />);
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("still opens the calendar on click and picks a day", () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-10-01" onChange={onChange} />);
    fireEvent.click(box());
    fireEvent.click(screen.getByRole("button", { name: "15" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-10-15");
    expect(box().value).toBe("2026-10-15");
  });
});
