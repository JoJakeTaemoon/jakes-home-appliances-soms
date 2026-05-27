"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "@/i18n/navigation";

type RoleKey = "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";

function getInitials(name: string): string {
  if (!name) return "";
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserMenu() {
  const t = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const { user, logout } = useAuth();
  const router = useRouter();
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

  const initials = getInitials(user.username);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-full px-2 py-1 max-md:min-h-[44px] cursor-pointer outline-none hover:bg-[#f5f5f5] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-200)]"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-blue-100)]">
          <span className="text-xs font-semibold text-[var(--brand-blue-700)]">{initials}</span>
        </div>
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-sm font-medium leading-none text-[#000000]">{user.username}</span>
          <span className="mt-0.5 text-xs font-normal leading-none text-[#737373]">
            {tRoles(user.role as RoleKey)}
          </span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[176px] rounded-xl border border-[#e5e5e5] bg-white p-1 shadow-[0_4px_12px_rgba(0,113,189,0.06)]">
          <div className="px-3 py-2">
            <p className="text-sm font-medium leading-none text-[#000000]">{user.username}</p>
            <p className="mt-1 text-xs font-normal leading-none text-[#737373]">
              {tRoles(user.role as RoleKey)}
            </p>
          </div>
          <div className="my-1 h-px bg-[#e5e5e5]" />
          <button
            type="button"
            className="flex w-full cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-normal text-[#000000] hover:bg-[#f5f5f5]"
            onClick={async () => {
              await logout();
              setOpen(false);
              router.replace("/login");
            }}
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
