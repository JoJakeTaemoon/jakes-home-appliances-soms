"use client";

import { Menu } from "lucide-react";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { UserMenu } from "@/components/layout/user-menu";

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
          className="flex size-9 max-md:size-11 cursor-pointer items-center justify-center rounded-full text-[#525252] hover:bg-[#f5f5f5] hover:text-[#000000]"
        >
          <Menu className="size-5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <LocaleSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
