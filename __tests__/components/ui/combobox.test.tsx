/**
 * Combobox defaults used to be hardcoded English ("Select…", "Search…",
 * "No results", `Add "x"`), so every caller that passed nothing showed
 * English on a Korean / Vietnamese screen. Defaults now come from `common.*`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ko from "@/messages/ko.json";
import vi_ from "@/messages/vi.json";
import { Combobox } from "@/components/ui/combobox";

const OPTIONS = ["a", "b", "c", "d", "e", "f"].map((v) => ({ value: v, label: `Option ${v}` }));

function renderIn(locale: "ko" | "vi", props: Partial<Parameters<typeof Combobox>[0]> = {}) {
  const messages = locale === "ko" ? ko : vi_;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Combobox value={null} onChange={() => undefined} options={OPTIONS} ariaLabel="pick" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("Combobox — translated defaults", () => {
  it("uses Korean placeholder, search box and empty text when the caller passes none", () => {
    renderIn("ko");
    expect(screen.getByRole("button", { name: "pick" })).toHaveTextContent(ko.common.selectPlaceholder);
    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    const search = screen.getByPlaceholderText(ko.common.searchPlaceholder);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText(ko.common.noResults)).toBeInTheDocument();
  });

  it("follows the UI language (vi)", () => {
    renderIn("vi");
    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    fireEvent.change(screen.getByPlaceholderText(vi_.common.searchPlaceholder), { target: { value: "zzz" } });
    expect(screen.getByText(vi_.common.noResults)).toBeInTheDocument();
  });

  it("translates the default create row", () => {
    const onCreate = vi.fn();
    renderIn("ko", { allowCreate: true, onCreate });
    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    fireEvent.change(screen.getByPlaceholderText(ko.common.searchPlaceholder), { target: { value: "제습기" } });
    fireEvent.click(screen.getByRole("option", { name: /「제습기」 추가/ }));
    expect(onCreate).toHaveBeenCalledWith("제습기");
  });

  it("keeps caller-supplied text", () => {
    renderIn("ko", { placeholder: "모델 선택", searchPlaceholder: "모델 검색", emptyText: "모델 없음" });
    expect(screen.getByRole("button", { name: "pick" })).toHaveTextContent("모델 선택");
    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    fireEvent.change(screen.getByPlaceholderText("모델 검색"), { target: { value: "zzz" } });
    expect(screen.getByText("모델 없음")).toBeInTheDocument();
  });
});
