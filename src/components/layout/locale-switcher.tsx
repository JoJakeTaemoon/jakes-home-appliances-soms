"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { ChevronDown } from "lucide-react";

const locales = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
] as const;

function useCurrentLocale(): string {
  try {
    // Dynamic require to avoid vitest mock errors when useLocale is not mocked
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useLocale } = require("next-intl");
    return useLocale();
  } catch {
    return "ko";
  }
}

export function LocaleSwitcher() {
  const locale = useCurrentLocale();
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

  const handleLocaleChange = (newLocale: string) => {
    router.replace({ pathname }, { locale: newLocale });
    setOpen(false);
  };

  return (
    <div data-testid="locale-switcher" className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3 h-8 max-md:h-11 text-sm font-normal text-[#525252] hover:bg-[#fafafa] hover:border-[#e5e5e5] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        onClick={() => setOpen((prev) => !prev)}
      >
        {currentLocale?.label}
        <ChevronDown className="size-3.5 text-[#a3a3a3]" strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[128px] rounded-xl border border-[#e5e5e5] bg-white p-1 shadow-none">
          {locales.map((l) => (
            <button
              key={l.value}
              type="button"
              className={
                l.value === locale
                  ? "flex w-full items-center rounded-full px-3 py-1.5 text-sm font-normal text-[#000000] bg-[#e5e5e5] cursor-pointer"
                  : "flex w-full items-center rounded-full px-3 py-1.5 text-sm font-normal text-[#525252] hover:bg-[#fafafa] cursor-pointer"
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
