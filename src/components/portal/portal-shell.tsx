"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

interface TabDef {
  href: string;
  labelKey: "dashboard" | "equipment" | "visits" | "requests" | "settings";
  icon: string;
}

const TABS: TabDef[] = [
  { href: "/portal", labelKey: "dashboard", icon: "🏠" },
  { href: "/equipment", labelKey: "equipment", icon: "💧" },
  { href: "/visits", labelKey: "visits", icon: "📅" },
  { href: "/requests", labelKey: "requests", icon: "📨" },
  { href: "/settings", labelKey: "settings", icon: "⚙️" },
];

export function PortalShell({ children }: Readonly<{ children: ReactNode }>) {
  const { contact, logout } = useCustomerAuth();
  const t = useTranslations("portal");
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF6EF]">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[#e5e5e5] bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,113,189,0.05)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e5e5e5] bg-white">
            <Image
              src="/logo/seoul-aqua-logo.jpg"
              alt="Seoul Aqua"
              width={36}
              height={36}
              priority
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#002A4D]">
              {contact?.customerName ?? "Seoul Aqua"}
            </div>
            <div className="truncate text-xs text-[#737373]">
              {contact?.name ?? ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-[#e5e5e5] bg-white px-3 h-9 text-xs font-medium text-[#525252] outline-none transition-colors hover:border-[#a3a3a3] hover:text-[#262626]"
          >
            {t("logout")}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4 sm:mx-auto sm:w-full sm:max-w-2xl">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-[#e5e5e5] bg-white sm:mx-auto sm:max-w-2xl">
        {TABS.map((tab) => {
          const active =
            tab.href === "/portal"
              ? pathname === "/portal"
              : pathname?.startsWith(tab.href);
          return (
            <button
              type="button"
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={[
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] outline-none transition-colors",
                active
                  ? "text-[var(--brand-blue-600)]"
                  : "text-[#737373] hover:text-[#262626]",
              ].join(" ")}
            >
              <span className="text-xl leading-none" aria-hidden>
                {tab.icon}
              </span>
              <span className="font-medium">{t(`tabs.${tab.labelKey}`)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
