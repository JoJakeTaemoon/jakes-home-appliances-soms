/**
 * mustChangePassword was ignored in /o and /f, so an admin-issued temp
 * password stayed forever. Both realm guards now send a flagged user to
 * their realm's change-password page (the page itself opts out with
 * `requireChange`), and both realms expose a voluntary entry point.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "ko",
}));
const { replace, push, office, field } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  office: { current: {} as Record<string, unknown> },
  field: { current: {} as Record<string, unknown> },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace, push }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => office.current }));
vi.mock("@/providers/field-auth-provider", () => ({ useFieldAuth: () => field.current }));
vi.mock("@/components/mobile/mobile-shell", () => ({
  MobileShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AuthGuard } from "@/components/layout/auth-guard";
import { TechnicianAuthGuard } from "@/components/mobile/technician-guard";
import { UserMenu } from "@/components/layout/user-menu";
import MobileProfilePage from "@/app/f/[locale]/profile/page";

const staff = (mustChangePassword: boolean) => ({
  user: { id: "u1", username: "thu", role: "STAFF", phone: "0900", mustChangePassword },
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn().mockResolvedValue(undefined),
});
const tech = (mustChangePassword: boolean) => ({
  ...staff(mustChangePassword),
  user: { id: "t1", username: "hoang", role: "TECHNICIAN", phone: "0911", mustChangePassword },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("office AuthGuard", () => {
  it("sends a user with a temp password to /o/change-password and hides the page", () => {
    office.current = staff(true);
    render(<AuthGuard><p>secret</p></AuthGuard>);
    expect(replace).toHaveBeenCalledWith("/o/change-password");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("lets the change-password page itself render", () => {
    office.current = staff(true);
    render(<AuthGuard requireChange><p>form</p></AuthGuard>);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("form")).toBeInTheDocument();
  });

  it("leaves everyone else alone", () => {
    office.current = staff(false);
    render(<AuthGuard><p>secret</p></AuthGuard>);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});

describe("field TechnicianAuthGuard", () => {
  it("sends a technician with a temp password to /f/change-password", () => {
    field.current = tech(true);
    render(<TechnicianAuthGuard><p>today</p></TechnicianAuthGuard>);
    expect(replace).toHaveBeenCalledWith("/f/change-password");
    expect(screen.queryByText("today")).toBeNull();
  });

  it("lets the change-password page itself render", () => {
    field.current = tech(true);
    render(<TechnicianAuthGuard requireChange><p>form</p></TechnicianAuthGuard>);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("form")).toBeInTheDocument();
  });
});

describe("entry points", () => {
  it("office user menu links to the change-password page", () => {
    office.current = staff(false);
    render(<UserMenu />);
    fireEvent.click(screen.getByRole("button", { name: /thu/ }));
    fireEvent.click(screen.getByRole("button", { name: "portal.changePassword.title" }));
    expect(push).toHaveBeenCalledWith("/o/change-password");
  });

  it("field 내 정보 translates the role and links to the change-password page", () => {
    field.current = tech(false);
    render(<MobileProfilePage />);
    expect(screen.getByText("roles.TECHNICIAN")).toBeInTheDocument();
    expect(screen.queryByText("TECHNICIAN")).toBeNull();
    expect(screen.getByRole("link", { name: "portal.changePassword.title" })).toHaveAttribute(
      "href",
      "/f/change-password",
    );
  });
});
