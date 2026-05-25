"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { Link } from "@/i18n/navigation";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function UserMenu() {
  const t = useTranslations("nav");
  const tAdmin = useTranslations("admin");
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const initials = getInitials(user.name);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-full px-2 py-1 max-md:min-h-[44px] hover:bg-[#fafafa] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5]">
          <span className="text-xs font-medium text-[#525252]">{initials}</span>
        </div>
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-sm font-medium text-[#000000] leading-none">{user.name}</span>
          <span className="text-xs font-normal text-[#737373] leading-none mt-0.5">{tAdmin(`roles.${user.role}`)}</span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[176px] rounded-xl border border-[#e5e5e5] bg-white p-1 shadow-none">
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-[#000000] leading-none">{user.name}</p>
            <p className="text-xs font-normal text-[#737373] leading-none mt-1">{tAdmin(`roles.${user.role}`)}</p>
          </div>
          <div className="my-1 h-px bg-[#e5e5e5]" />
          <Link
            href="/profile"
            className="flex w-full items-center rounded-full px-3 py-1.5 text-sm font-normal text-[#525252] hover:bg-[#fafafa]"
            onClick={() => setOpen(false)}
          >
            {t("profile")}
          </Link>
          <div className="my-1 h-px bg-[#e5e5e5]" />
          <button
            type="button"
            className="flex w-full items-center rounded-full px-3 py-1.5 text-sm font-normal text-[#000000] hover:bg-[#fafafa] cursor-pointer"
            onClick={async () => {
              await logout();
              setOpen(false);
              globalThis.location.href = "/login";
            }}
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
