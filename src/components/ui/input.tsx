"use client";

import { forwardRef } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/cn";

// Browsers (Chrome, Safari, Edge) use the input element's `lang` attribute
// — falling back to the closest ancestor — to pick the calendar/clock
// picker's display language and date-format ordering. Auto-inject the
// active next-intl locale for the picker types so `vi` shows DD/MM/YYYY,
// `ko` shows 년/월/일, and `en` shows the month-name picker, without
// every callsite having to remember the `lang` prop.
const LOCALE_AWARE_TYPES = new Set([
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
]);

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type, lang, ...rest }, ref) {
    const locale = useLocale();
    const isPicker = typeof type === "string" && LOCALE_AWARE_TYPES.has(type);
    const effectiveLang = lang ?? (isPicker ? locale : undefined);
    return (
      <input
        ref={ref}
        type={type}
        lang={effectiveLang}
        className={cn(
          "h-10 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#111111] outline-none",
          "placeholder:text-[#a3a3a3]",
          "focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]",
          "disabled:cursor-not-allowed disabled:bg-[#fafafa] disabled:text-[#737373]",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#111111] outline-none",
          "placeholder:text-[#a3a3a3]",
          "focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]",
          className,
        )}
        {...rest}
      />
    );
  },
);
