"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { LogOut, Calendar, Clock4, User } from "lucide-react";
import { ServiceWorkerRegister } from "@/components/mobile/sw-register";
import { OfflineIndicator } from "@/components/mobile/offline-indicator";

type TabKey = "today" | "upcoming" | "profile";

const TABS: Array<{ key: TabKey; href: string; Icon: typeof Calendar }> = [
  { key: "today", href: "/f/today", Icon: Calendar },
  { key: "upcoming", href: "/f/upcoming", Icon: Clock4 },
  { key: "profile", href: "/f/profile", Icon: User },
];

export function MobileShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslations("mobile");
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-[#f7f8fb]">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-[var(--brand-blue-500)] px-4 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{t("appName")}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-90">{user?.username}</span>
          <button
            type="button"
            onClick={() => {
              logout().catch(() => undefined);
            }}
            aria-label={t("logout")}
            className="rounded-md p-1 hover:bg-white/10"
          >
            <LogOut className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <ServiceWorkerRegister />
        <OfflineIndicator />
        {children}
      </main>

      <nav
        aria-label="primary"
        className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-stretch border-t border-[#e5e5e5] bg-white"
      >
        {TABS.map(({ key, href, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={key}
              href={href}
              className={
                active
                  ? "flex flex-1 flex-col items-center justify-center gap-0.5 text-[var(--brand-blue-700)]"
                  : "flex flex-1 flex-col items-center justify-center gap-0.5 text-[#737373]"
              }
            >
              <Icon className="size-5" strokeWidth={1.6} />
              <span className="text-xs">{t(`tabs.${key}`)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
