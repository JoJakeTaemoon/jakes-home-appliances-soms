/**
 * 알림 서식 page — every template description used to render in Vietnamese
 * whatever the UI language (it followed the template's locale tab, which
 * defaults to vi), and the channel filter said "All channels" in English.
 * next-intl is mocked to echo `namespace.key`, so a translated label shows up
 * as its key and a hardcoded string shows up bare.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TEMPLATE_DESCRIPTIONS } from "@/lib/notifications/template-descriptions";

let uiLocale = "ko";
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useLocale: () => uiLocale,
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: { role: "ADMIN" } }),
}));

type Row = {
  code: string;
  channel: "SMS" | "EMAIL";
  locale: "ko" | "vi" | "en";
  description?: string;
  defaultBody: string;
  defaultSubject: string | null;
  overrideBody: null;
  overrideSubject: null;
  overrideUpdatedAt: null;
  enabled: boolean;
};

function row(code: string, channel: "SMS" | "EMAIL", locale: Row["locale"]): Row {
  return {
    code,
    channel,
    locale,
    // What the API used to send: the description in the row's own locale.
    description: TEMPLATE_DESCRIPTIONS[code][locale],
    defaultBody: `${code} body ${locale}`,
    defaultSubject: channel === "EMAIL" ? `${code} subject` : null,
    overrideBody: null,
    overrideSubject: null,
    overrideUpdatedAt: null,
    enabled: true,
  };
}

const rows: Row[] = [
  row("SMS_VISIT_REMINDER", "SMS", "vi"),
  row("SMS_VISIT_REMINDER", "SMS", "en"),
  row("EMAIL_RECEIPT", "EMAIL", "ko"),
  row("EMAIL_RECEIPT", "EMAIL", "vi"),
  row("EMAIL_RECEIPT", "EMAIL", "en"),
];

const api = {
  get: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
};
vi.mock("@/lib/api/client", () => ({ useApi: () => api }));

import NotificationTemplatesPage from "@/app/o/[locale]/(dashboard)/admin/notification-templates/page";

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: { rows } });
});

describe("notification templates page", () => {
  it("shows each description in the UI language (ko), not the vi tab's", async () => {
    uiLocale = "ko";
    render(<NotificationTemplatesPage />);
    await waitFor(() =>
      expect(
        screen.getByText(TEMPLATE_DESCRIPTIONS.SMS_VISIT_REMINDER.ko),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(TEMPLATE_DESCRIPTIONS.EMAIL_RECEIPT.ko)).toBeInTheDocument();
    expect(
      screen.queryByText(TEMPLATE_DESCRIPTIONS.SMS_VISIT_REMINDER.vi),
    ).not.toBeInTheDocument();
  });

  it("follows an English UI too", async () => {
    uiLocale = "en";
    render(<NotificationTemplatesPage />);
    await waitFor(() =>
      expect(
        screen.getByText(TEMPLATE_DESCRIPTIONS.SMS_VISIT_REMINDER.en),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(TEMPLATE_DESCRIPTIONS.EMAIL_RECEIPT.en)).toBeInTheDocument();
  });

  it("translates the channel filter and the empty-editor prompt", async () => {
    uiLocale = "ko";
    render(<NotificationTemplatesPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(
      screen.getByText("admin.notificationTemplates.channelAll"),
    ).toBeInTheDocument();
    expect(screen.queryByText("All channels")).not.toBeInTheDocument();
    expect(
      screen.getByText("admin.notificationTemplates.pickPrompt"),
    ).toBeInTheDocument();
  });

  it("keeps the editor's description and labels in the UI language", async () => {
    uiLocale = "ko";
    render(<NotificationTemplatesPage />);
    const emailVi = await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /^VI/ });
      expect(buttons.length).toBe(2);
      return buttons[1];
    });
    fireEvent.click(emailVi);

    await waitFor(() =>
      expect(screen.getAllByText(TEMPLATE_DESCRIPTIONS.EMAIL_RECEIPT.ko)).toHaveLength(2),
    );
    expect(screen.getByText("admin.notificationTemplates.subject")).toBeInTheDocument();
    expect(screen.getByText("admin.notificationTemplates.body")).toBeInTheDocument();
    expect(screen.getByText("admin.notificationTemplates.save")).toBeInTheDocument();
    expect(screen.queryByText("Save override")).not.toBeInTheDocument();
  });
});
