"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useApiQuery } from "@/lib/api/hooks";
import {
  LayoutDashboard,
  Users,
  Cpu,
  FileText,
  CalendarCheck,
  LayoutGrid,
  Printer,
  Wallet,
  Inbox,
  Receipt,
  BarChart3,
  Settings,
  Phone,
  Package,
  ScrollText,
  MessageSquareDot,
} from "lucide-react";

type LabelKey =
  | "dashboard"
  | "customers"
  | "equipment"
  | "contracts"
  | "visits"
  | "scheduleBoard"
  | "visitsPrint"
  | "serviceRequests"
  | "payments"
  | "taxInvoices"
  | "reports"
  | "userManagement"
  | "admin"
  | "settings"
  | "notificationTemplates"
  | "companyContact"
  | "products"
  | "auditLog";

type RoleKey = "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";

/**
 * `roles` is the canonical visibility list per item. Items hide for any
 * role that lacks page-level access — keep this list in sync with the
 * page's actual auth guard so the sidebar never advertises a 403.
 */
interface NavItem {
  href: string;
  labelKey: LabelKey;
  Icon: typeof LayoutDashboard;
  disabled?: boolean;
  roles: readonly RoleKey[];
}

const ALL_OFFICE_ROLES: readonly RoleKey[] = [
  "ADMIN",
  "MANAGER",
  "STAFF",
  "TECHNICIAN",
];
const ADMIN_MANAGER: readonly RoleKey[] = ["ADMIN", "MANAGER"];

const navItems: NavItem[] = [
  { href: "/o/dashboard", labelKey: "dashboard", Icon: LayoutDashboard, roles: ALL_OFFICE_ROLES },
  { href: "/o/customers", labelKey: "customers", Icon: Users, roles: ALL_OFFICE_ROLES },
  { href: "/o/contracts", labelKey: "contracts", Icon: FileText, roles: ALL_OFFICE_ROLES },
  { href: "/o/schedule-board", labelKey: "scheduleBoard", Icon: LayoutGrid, roles: ALL_OFFICE_ROLES },
  { href: "/o/visits", labelKey: "visits", Icon: CalendarCheck, roles: ALL_OFFICE_ROLES },
  { href: "/o/visits/print", labelKey: "visitsPrint", Icon: Printer, roles: ALL_OFFICE_ROLES },
  { href: "/o/service-requests", labelKey: "serviceRequests", Icon: Inbox, roles: ALL_OFFICE_ROLES },
  // Equipment moved below service-requests (2026-06-22) — equipment is
  // installed via the contract creation flow now, not as a standalone
  // entry point, so it belongs further down the day-to-day list.
  { href: "/o/equipment", labelKey: "equipment", Icon: Cpu, roles: ALL_OFFICE_ROLES },
  { href: "/o/payments", labelKey: "payments", Icon: Wallet, roles: ALL_OFFICE_ROLES },
  { href: "/o/tax-invoices", labelKey: "taxInvoices", Icon: Receipt, roles: ALL_OFFICE_ROLES },
  { href: "/o/reports", labelKey: "reports", Icon: BarChart3, roles: ALL_OFFICE_ROLES },
];

const adminNavItems: NavItem[] = [
  { href: "/o/reports/audit", labelKey: "auditLog", Icon: ScrollText, roles: ADMIN_MANAGER },
  { href: "/o/admin/products", labelKey: "products", Icon: Package, roles: ADMIN_MANAGER },
  { href: "/o/admin/users", labelKey: "userManagement", Icon: Users, roles: ADMIN_MANAGER },
  { href: "/o/admin/company-contact", labelKey: "companyContact", Icon: Phone, roles: ADMIN_MANAGER },
];

const adminSettingsItems: NavItem[] = [
  { href: "/o/admin/notification-templates", labelKey: "notificationTemplates", Icon: Settings, roles: ADMIN_MANAGER },
];

function visibleFor(items: readonly NavItem[], role: RoleKey | undefined): NavItem[] {
  if (!role) return [];
  return items.filter((it) => it.roles.includes(role));
}

function getInitials(name: string): string {
  if (!name) return "";
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Decide whether a nav item should render as active.
 *
 * Two-stage check so a deeper entry (e.g. `/o/visits/print`) doesn't
 * leave its parent (`/o/visits`) lit up at the same time:
 *   1. Path must equal the item's href, or start with `${href}/`.
 *   2. No other listed href may be a more-specific prefix of pathname.
 */
function isItemActive(
  itemHref: string,
  pathname: string,
  allHrefs: readonly string[],
): boolean {
  const matches =
    pathname === itemHref || pathname.startsWith(`${itemHref}/`);
  if (!matches) return false;
  for (const other of allHrefs) {
    if (other === itemHref) continue;
    if (!other.startsWith(`${itemHref}/`)) continue;
    if (pathname === other || pathname.startsWith(`${other}/`)) {
      return false;
    }
  }
  return true;
}

export function Sidebar() {
  const t = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const { user } = useAuth();
  const pathname = usePathname();

  const role = user?.role as RoleKey | undefined;
  const visibleMain = visibleFor(navItems, role);
  const visibleAdmin = visibleFor(adminNavItems, role);
  const visibleAdminSettings = visibleFor(adminSettingsItems, role);
  const allHrefs = [
    ...navItems,
    ...adminNavItems,
    ...adminSettingsItems,
  ].map((i) => i.href);
  const showAdminSection =
    visibleAdmin.length > 0 || visibleAdminSettings.length > 0;

  // Office-only badge: how many SRs have at least one unread customer
  // message. Refetches every 60s and on focus so the badge clears soon
  // after another tab marks one read. The TECHNICIAN role never sees
  // SR data, so we skip the fetch for them entirely.
  const isOfficeRole =
    role === "ADMIN" || role === "MANAGER" || role === "STAFF";
  const unreadQuery = useApiQuery<{ count: number }>(
    isOfficeRole ? "/api/service-requests/unread-count" : null,
    { refetchInterval: 60_000, refetchOnWindowFocus: true },
  );
  const unreadCount = unreadQuery.data?.count ?? 0;

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
          {visibleMain.map((item) => {
            const label = t(item.labelKey);
            const Icon = item.Icon;
            const active = isItemActive(item.href, pathname, allHrefs);

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

            const showUnreadBadge =
              item.labelKey === "serviceRequests" && unreadCount > 0;
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
                  <span className="flex-1">{label}</span>
                  {showUnreadBadge && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-semibold text-[#b91c1c]"
                      title={t("unreadMessageBadge")}
                      aria-label={t("unreadMessageBadge")}
                    >
                      <MessageSquareDot
                        className="size-3"
                        strokeWidth={2}
                      />
                      {unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {showAdminSection && (
          <>
            <p className="mt-4 px-3 pb-2 text-xs font-medium uppercase tracking-wider text-[#a3a3a3]">
              {t("admin")}
            </p>
            <ul className="space-y-0.5">
              {visibleAdmin.map((item) => {
                const Icon = item.Icon;
                const active = isItemActive(item.href, pathname, allHrefs);
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

            {visibleAdminSettings.length > 0 && (
              <div className="mt-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-normal text-[#525252]">
                <Settings className="size-5 shrink-0" strokeWidth={1.5} />
                <span>{t("settings")}</span>
              </div>
            )}
            <ul className="space-y-0.5">
              {visibleAdminSettings.map((item) => {
                const Icon = item.Icon;
                const active = isItemActive(item.href, pathname, allHrefs);
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
