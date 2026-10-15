/**
 * Shared office/field change-password form. Mirrors the portal form: client
 * checks (min 8, confirm matches), POSTs with the realm's bearer token, maps
 * WRONG_PASSWORD / PASSWORD_REUSE to translated messages.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "ko",
}));

import { ChangePasswordForm } from "@/components/auth/change-password-form";

const fetchMock = vi.fn();
const onDone = vi.fn();

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText("portal.changePassword.current"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("portal.changePassword.newPwd"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("portal.changePassword.confirm"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "portal.changePassword.submit" }));
}

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("ChangePasswordForm", () => {
  const renderForm = (forced = false, onCancel?: () => void) =>
    render(
      <ChangePasswordForm
        endpoint="/api/auth/change-password"
        accessToken="tok-1"
        forced={forced}
        onDone={onDone}
        onCancel={onCancel}
      />,
    );

  it("posts the change with the bearer token and hands off on success", async () => {
    reply(200, { success: true, data: { ok: true } });
    renderForm();
    fill("TempPw1234", "BrandNew99");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/change-password");
    expect(init.headers.Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(init.body)).toEqual({ currentPassword: "TempPw1234", newPassword: "BrandNew99" });
  });

  it("checks length and confirmation before calling the server", () => {
    renderForm();
    fill("TempPw1234", "short");
    expect(screen.getByRole("alert")).toHaveTextContent("portal.changePassword.errorMinLength");
    fill("TempPw1234", "BrandNew99", "BrandNew98");
    expect(screen.getByRole("alert")).toHaveTextContent("portal.changePassword.errorMismatch");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["WRONG_PASSWORD", "portal.changePassword.errorWrongCurrent"],
    ["PASSWORD_REUSE", "portal.changePassword.errorReuse"],
  ])("maps %s to a translated message", async (code, message) => {
    reply(400, { success: false, error: { code, message: "x" } });
    renderForm();
    fill("TempPw1234", "BrandNew99");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("explains a forced change and offers no way out", () => {
    renderForm(true, vi.fn());
    expect(screen.getByText("auth.mustChangeNotice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "common.cancel" })).toBeNull();
  });

  it("lets a voluntary change be cancelled", () => {
    const onCancel = vi.fn();
    renderForm(false, onCancel);
    expect(screen.queryByText("auth.mustChangeNotice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
