/**
 * Field login must show translated errors, never the server's English
 * message ("Invalid credentials", "Account is temporarily locked").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));
vi.mock("next/image", () => ({
  default: () => null,
}));
vi.mock("@/components/layout/locale-switcher", () => ({
  LocaleSwitcher: () => null,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockLogin = vi.fn();
vi.mock("@/providers/field-auth-provider", () => {
  class FieldLoginError extends Error {
    code: string;
    suggestedUrl?: string;
    constructor(message: string, code: string, suggestedUrl?: string) {
      super(message);
      this.code = code;
      this.suggestedUrl = suggestedUrl;
    }
  }
  return { FieldLoginError, useFieldAuth: () => ({ login: mockLogin }) };
});

import { FieldLoginError } from "@/providers/field-auth-provider";
import MobileLoginPage from "@/app/f/[locale]/login/page";

const Err = FieldLoginError as unknown as new (m: string, c: string, u?: string) => Error;

async function submitWith(err: Error) {
  mockLogin.mockRejectedValueOnce(err);
  render(<MobileLoginPage />);
  fireEvent.change(screen.getByLabelText(/loginPhone/), { target: { value: "0900000000" } });
  fireEvent.change(screen.getByLabelText(/loginPassword/), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: "loginSubmit" }));
}

describe("field login error messages", () => {
  beforeEach(() => mockLogin.mockReset());

  it("translates INVALID_CREDENTIALS", async () => {
    await submitWith(new Err("Invalid credentials", "INVALID_CREDENTIALS"));
    expect(await screen.findByText("loginErrorInvalidCredentials")).toBeInTheDocument();
    expect(screen.queryByText("Invalid credentials")).toBeNull();
  });

  it("translates ACCOUNT_LOCKED", async () => {
    await submitWith(new Err("Account is temporarily locked", "ACCOUNT_LOCKED"));
    expect(await screen.findByText("loginErrorLocked")).toBeInTheDocument();
  });

  it("translates ACCOUNT_INACTIVE", async () => {
    await submitWith(new Err("Account is inactive", "ACCOUNT_INACTIVE"));
    expect(await screen.findByText("loginErrorInactive")).toBeInTheDocument();
  });

  it("falls back to the generic message for anything else", async () => {
    await submitWith(new Err("Network error", "NETWORK_ERROR"));
    expect(await screen.findByText("loginError")).toBeInTheDocument();
    expect(screen.queryByText("Network error")).toBeNull();
  });

  it("shows only the translated office hint on ROLE_MISMATCH", async () => {
    await submitWith(new Err("This page is for field technicians only", "ROLE_MISMATCH", "/o/ko/login"));
    expect(await screen.findByText("loginRoleMismatchOffice")).toBeInTheDocument();
    expect(screen.queryByText("This page is for field technicians only")).toBeNull();
  });
});
