"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname, getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ChevronDown, Globe } from "lucide-react";

const locales = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
] as const;

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
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

  const currentLocale = locales.find((l) => l.value === locale);

  const handleLocaleChange = (newLocale: Locale) => {
    router.replace(getPathname({ href: pathname, locale: newLocale }));
    setOpen(false);
  };

  return (
    <div data-testid="locale-switcher" className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex h-9 max-md:h-11 cursor-pointer items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-3.5 text-sm font-medium text-[#262626] outline-none hover:bg-[#fafafa] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-200)]"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Change language"
      >
        <Globe className="size-4 text-[var(--brand-blue-700)]" strokeWidth={1.75} />
        {currentLocale?.label}
        <ChevronDown className="size-3.5 text-[#a3a3a3]" strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[128px] rounded-xl border border-[#e5e5e5] bg-white p-1">
          {locales.map((l) => (
            <button
              key={l.value}
              type="button"
              className={
                l.value === locale
                  ? "flex w-full cursor-pointer items-center rounded-md bg-[var(--brand-blue-50)] px-3 py-1.5 text-sm font-medium text-[var(--brand-blue-700)]"
                  : "flex w-full cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-normal text-[#525252] hover:bg-[#fafafa]"
              }
              onClick={() => handleLocaleChange(l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
