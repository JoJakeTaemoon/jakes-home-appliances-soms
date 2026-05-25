"use client";

import Image from "next/image";
import { Menu } from "lucide-react";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header
      role="banner"
      className="flex h-14 shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-4"
    >
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          aria-label="menu"
          onClick={onMenuClick}
          className="flex items-center justify-center rounded-full size-9 max-md:size-11 text-[#737373] hover:bg-[#e5e5e5] hover:text-[#000000] cursor-pointer"
        >
          <Menu className="size-5" strokeWidth={1.5} />
        </button>
        <div className="rounded-lg bg-[#090909] px-2.5 py-1">
          <Image src="/mega_dnc_logo.png" alt="MegaDnC" width={72} height={28} />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <NotificationBell />
        <LocaleSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
