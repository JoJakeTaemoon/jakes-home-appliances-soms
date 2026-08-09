"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A small "?" icon that reveals an explanatory tooltip on hover or keyboard
 * focus. Custom-built (no native `title`) so it matches the design system and
 * works on touch/keyboard. Place it next to a field label:
 *
 *   <FormField label={<>판매가 <HelpTooltip text="실제 판매가입니다." /></>}>
 */
export function HelpTooltip({
  text,
  className,
}: Readonly<{ text: ReactNode; className?: string }>) {
  return (
    <span className={cn("group/ht relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={typeof text === "string" ? text : "설명"}
        // Non-submitting, non-navigating — it only surfaces the tooltip.
        onClick={(e) => e.preventDefault()}
        className="flex size-4 items-center justify-center rounded-full border border-[#d4d4d4] text-[10px] font-semibold leading-none text-[#737373] transition-colors hover:border-[var(--brand-blue-500)] hover:text-[var(--brand-blue-600)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-200)]"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-[#111827] px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover/ht:opacity-100 group-focus-within/ht:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
