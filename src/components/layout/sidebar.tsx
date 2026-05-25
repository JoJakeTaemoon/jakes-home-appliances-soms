"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { ChevronDown } from "lucide-react";
import {
  mainNavItems,
  masterNavItems,
  adminNavItems,
  type NavItem,
} from "@/config/navigation";

const ADMIN_ROLES = new Set(["SYSTEM_ADMIN", "DIRECTOR"]);
const MASTER_ROLES = new Set(["SYSTEM_ADMIN", "DIRECTOR", "MANAGER"]);

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function NavLink({
  item,
  pathname,
  label,
  indented = false,
  activeOverride,
}: Readonly<{
  item: NavItem;
  pathname: string;
  label: string;
  indented?: boolean;
  activeOverride?: boolean;
}>) {
  // Children are visually nested under their parent group via a fixed
  // left indent on the row. We use padding rather than transform so the
  // hover/active background still spans the full sidebar width.
  const padLeft = indented ? "pl-9" : "pl-3";
  // WCAG mobile touch target: min 44px at < md. Desktop stays compact.
  const touchTarget = "max-md:min-h-[44px]";
  if (item.disabled) {
    return (
      <span
        className={`flex items-center gap-3 rounded-full ${padLeft} pr-3 py-2 ${touchTarget} text-sm font-normal text-[#a3a3a3] cursor-default`}
      >
        <item.icon className="size-5 shrink-0" strokeWidth={1.5} />
        {label}
        <span className="ml-auto rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-medium text-[#a3a3a3]">TBD</span>
      </span>
    );
  }
  // When the parent group decides which sibling is "the" active leaf
  // (e.g. /admin/settings/integrations should NOT also highlight
  // /admin/settings), it passes activeOverride to short-circuit the
  // default prefix-match rule.
  const isActive =
    activeOverride ??
    (pathname === item.href || pathname.startsWith(item.href + "/"));
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? `flex items-center gap-3 rounded-full ${padLeft} pr-3 py-2 ${touchTarget} text-sm font-medium text-[#000000] bg-[#e5e5e5]`
          : `flex items-center gap-3 rounded-full ${padLeft} pr-3 py-2 ${touchTarget} text-sm font-normal text-[#737373] hover:bg-[#e5e5e5] hover:text-[#000000] transition-none`
      }
    >
      <item.icon className="size-5 shrink-0" strokeWidth={1.5} />
      {label}
      {item.badge ? (
        <span className="ml-auto rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-medium text-[#a3a3a3]">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

// Collapsible group for NavItems whose `children` are defined. The parent
// row is non-navigable — clicking it toggles the child list. Default-open
// when the current pathname matches one of the children (so the user lands
// on `/admin/settings/integrations` and immediately sees the active leaf
// highlighted instead of needing to expand the parent first).
function NavGroup({
  item,
  pathname,
  label,
  childLabel,
}: Readonly<{
  item: NavItem;
  pathname: string;
  label: string;
  childLabel: (key: string) => string;
}>) {
  const children = item.children ?? [];
  // Pick the single most-specific match — the child whose href is the
  // longest prefix of the current path. Without this, both
  // /admin/settings (photo upload) and /admin/settings/integrations
  // would light up on the integrations page.
  const activeChildHref =
    children
      .filter(
        (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const hasActiveChild = activeChildHref !== null;
  const [open, setOpen] = useState(hasActiveChild);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 rounded-full pl-3 pr-3 py-2 max-md:min-h-[44px] text-sm font-normal text-[#737373] hover:bg-[#e5e5e5] hover:text-[#000000] cursor-pointer"
      >
        <item.icon className="size-5 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-[#a3a3a3] transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>
      {open
        ? children.map((child) => (
            <NavLink
              key={child.href}
              item={child}
              pathname={pathname}
              label={childLabel(child.labelKey)}
              indented
              activeOverride={child.href === activeChildHref}
            />
          ))
        : null}
    </>
  );
}

/** Render either a flat link or a collapsible group depending on `children`. */
function NavEntry({
  item,
  pathname,
  label,
  childLabel,
}: Readonly<{
  item: NavItem;
  pathname: string;
  label: string;
  childLabel: (key: string) => string;
}>) {
  if (item.children && item.children.length > 0) {
    return (
      <NavGroup item={item} pathname={pathname} label={label} childLabel={childLabel} />
    );
  }
  return <NavLink item={item} pathname={pathname} label={label} />;
}

export function Sidebar() {
  const t = useTranslations("nav");
  const tAdmin = useTranslations("admin");
  const { user } = useAuth();
  const pathname = usePathname();

  const role = user?.role ?? "";
  const isAdmin = ADMIN_ROLES.has(role);
  const canSeeMaster = MASTER_ROLES.has(role);
  const initials = user?.name ? getInitials(user.name) : "";

  return (
    <aside className="flex h-full w-64 flex-col bg-white border-r border-[#e5e5e5]">
      {/* Logo — dark background to show white-text logo */}
      <div className="flex h-14 items-center gap-2 border-b border-[#e5e5e5] bg-[#090909] px-4 shrink-0">
        <Image
          src="/mega_dnc_logo.png"
          alt="MegaDnC"
          width={90}
          height={35}
          priority
        />
        <span className="text-sm font-medium text-white" style={{ fontFamily: "var(--font-pretendard), ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
          PMIS
        </span>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <p className="px-3 pb-1 text-xs font-normal text-[#a3a3a3] uppercase tracking-wider">
          {t("main")}
        </p>
        {mainNavItems.map((item) => (
          <NavEntry
            key={item.href || item.labelKey}
            item={item}
            pathname={pathname}
            label={t(item.labelKey)}
            childLabel={(k) => t(k)}
          />
        ))}

        {canSeeMaster && (
          <>
            <div className="my-2 h-px bg-[#e5e5e5]" />
            <p className="px-3 pt-4 pb-1 text-xs font-normal text-[#a3a3a3] uppercase tracking-wider">
              {t("master")}
            </p>
            {masterNavItems.map((item) => (
              <NavEntry
                key={item.href || item.labelKey}
                item={item}
                pathname={pathname}
                label={t(item.labelKey)}
                childLabel={(k) => t(k)}
              />
            ))}
          </>
        )}

        {isAdmin && (
          <>
            <div className="my-2 h-px bg-[#e5e5e5]" />
            <p className="px-3 pt-4 pb-1 text-xs font-normal text-[#a3a3a3] uppercase tracking-wider">
              {t("admin")}
            </p>
            {adminNavItems.map((item) => (
              <NavEntry
                key={item.href || item.labelKey}
                item={item}
                pathname={pathname}
                label={t(item.labelKey)}
                childLabel={(k) => t(k)}
              />
            ))}
          </>
        )}
      </nav>

      {/* User section at bottom */}
      <div className="shrink-0 border-t border-[#e5e5e5] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5]">
            <span className="text-xs font-medium text-[#525252]">
              {initials}
            </span>
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-sm font-medium text-[#000000]">
              {user?.name}
            </span>
            <span className="truncate text-xs font-normal text-[#737373]">
              {user?.role ? tAdmin(`roles.${user.role}`) : ""}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
