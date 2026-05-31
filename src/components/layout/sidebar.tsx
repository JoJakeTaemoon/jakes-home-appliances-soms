"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import {
  LayoutDashboard,
  Users,
  Cpu,
  FileText,
  CalendarCheck,
  Wallet,
  Inbox,
  Receipt,
  BarChart3,
  Settings,
  Phone,
  Package,
} from "lucide-react";

type LabelKey =
  | "dashboard"
  | "customers"
  | "equipment"
  | "contracts"
  | "visits"
  | "serviceRequests"
  | "payments"
  | "taxInvoices"
  | "reports"
  | "userManagement"
  | "admin"
  | "settings"
  | "notificationTemplates"
  | "companyContact"
  | "products";

interface NavItem {
  href: string;
  labelKey: LabelKey;
  Icon: typeof LayoutDashboard;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", Icon: LayoutDashboard },
  { href: "/customers", labelKey: "customers", Icon: Users },
  { href: "/equipment", labelKey: "equipment", Icon: Cpu },
  { href: "/contracts", labelKey: "contracts", Icon: FileText },
  { href: "/visits", labelKey: "visits", Icon: CalendarCheck },
  { href: "/service-requests", labelKey: "serviceRequests", Icon: Inbox },
  { href: "/payments", labelKey: "payments", Icon: Wallet },
  { href: "/tax-invoices", labelKey: "taxInvoices", Icon: Receipt },
  { href: "/reports", labelKey: "reports", Icon: BarChart3 },
];

const adminNavItems: NavItem[] = [
  {
    href: "/admin/products",
    labelKey: "products",
    Icon: Package,
  },
  {
    href: "/admin/users",
    labelKey: "userManagement",
    Icon: Users,
  },
  {
    href: "/admin/company-contact",
    labelKey: "companyContact",
    Icon: Phone,
  },
];

const adminSettingsItems: NavItem[] = [
  {
    href: "/admin/notification-templates",
    labelKey: "notificationTemplates",
    Icon: Settings,
  },
];

function getInitials(name: string): string {
  if (!name) return "";
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type RoleKey = "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";

export function Sidebar() {
  const t = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const { user } = useAuth();
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[#e5e5e5] bg-white">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e5e5e5] bg-[var(--brand-blue-500)] px-4">
        <div className="flex size-9 items-center justify-center overflow-hidden rounded-md bg-white">
          <Image
            src="/logo/seoul-aqua-logo.jpg"
            alt="Seoul Aqua"
            width={36}
            height={36}
            priority
          />
        </div>
        <span className="text-sm font-semibold text-white">Seoul Aqua SOMS</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-[#a3a3a3]">
          {t("main")}
        </p>
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const label = t(item.labelKey);
            const Icon = item.Icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (item.disabled) {
              return (
                <li key={item.href}>
                  <span className="flex max-md:min-h-[44px] cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm font-normal text-[#a3a3a3]">
                    <Icon className="size-5 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1">{label}</span>
                    <span className="rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-medium text-[#a3a3a3]">
                      TBD
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex max-md:min-h-[44px] items-center gap-3 rounded-md bg-[var(--brand-blue-50)] px-3 py-2 text-sm font-medium text-[var(--brand-blue-700)]"
                      : "flex max-md:min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-normal text-[#525252] hover:bg-[#f5f5f5] hover:text-[#000000]"
                  }
                >
                  <Icon className="size-5 shrink-0" strokeWidth={1.5} />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
          <>
            <p className="mt-4 px-3 pb-2 text-xs font-medium uppercase tracking-wider text-[#a3a3a3]">
              {t("admin")}
            </p>
            <ul className="space-y-0.5">
              {adminNavItems.map((item) => {
                const Icon = item.Icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "flex max-md:min-h-[44px] items-center gap-3 rounded-md bg-[var(--brand-blue-50)] px-3 py-2 text-sm font-medium text-[var(--brand-blue-700)]"
                          : "flex max-md:min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-normal text-[#525252] hover:bg-[#f5f5f5] hover:text-[#000000]"
                      }
                    >
                      <Icon className="size-5 shrink-0" strokeWidth={1.5} />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-normal text-[#525252]">
              <Settings className="size-5 shrink-0" strokeWidth={1.5} />
              <span>{t("settings")}</span>
            </div>
            <ul className="space-y-0.5">
              {adminSettingsItems.map((item) => {
                const Icon = item.Icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "flex max-md:min-h-[44px] items-center gap-3 rounded-md bg-[var(--brand-blue-50)] py-2 pl-10 pr-3 text-sm font-medium text-[var(--brand-blue-700)]"
                          : "flex max-md:min-h-[44px] items-center gap-3 rounded-md py-2 pl-10 pr-3 text-sm font-normal text-[#525252] hover:bg-[#f5f5f5] hover:text-[#000000]"
                      }
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <div className="shrink-0 border-t border-[#e5e5e5] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-blue-100)]">
            <span className="text-xs font-semibold text-[var(--brand-blue-700)]">
              {user?.username ? getInitials(user.username) : ""}
            </span>
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-[#000000]">
              {user?.username ?? ""}
            </span>
            <span className="truncate text-xs font-normal text-[#737373]">
              {user?.role ? tRoles(user.role as RoleKey) : ""}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
