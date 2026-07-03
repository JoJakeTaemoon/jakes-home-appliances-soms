"use client";

import { forwardRef } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/cn";
import { DatePicker } from "./date-picker";

// Browsers (Chrome, Safari, Edge) use the input element's `lang` attribute
// — falling back to the closest ancestor — to pick the calendar/clock
// picker's display language and date-format ordering. Auto-inject the
// active next-intl locale for the picker types so `vi` shows DD/MM/YYYY,
// `ko` shows 년/월/일, and `en` shows the month-name picker, without
// every callsite having to remember the `lang` prop. `type="date"` is
// handled separately below — we replace it with our custom DatePicker
// so all three browsers render an identical, app-locale-driven
// calendar (Firefox ignores `lang` entirely).
const LOCALE_AWARE_TYPES = new Set([
  "datetime-local",
  "time",
  "month",
  "week",
]);

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type, lang, value, defaultValue, onChange, disabled, min, max, placeholder, "aria-label": ariaLabel, ...rest }, ref) {
    const locale = useLocale();

    // Swap `<Input type="date">` for the fully-controlled calendar
    // popover. Preserves the value/onChange contract callers already
    // pass, so most sites migrate without a rewrite. React-hook-form's
    // `register(...)` also spreads value/onChange, so this covers rhf
    // callers too — as long as the caller's value type is a plain
    // `YYYY-MM-DD` string, which is what `<input type="date">` produced.
    if (type === "date") {
      let strValue = "";
      if (typeof value === "string") strValue = value;
      else if (typeof defaultValue === "string") strValue = defaultValue;
      return (
        <DatePicker
          value={strValue}
          onChange={(v) => {
            if (onChange) {
              // Synthesize a minimal ChangeEvent shim — rhf reads
              // `e.target.value`, controlled components read the same.
              const synthetic = {
                target: { value: v },
                currentTarget: { value: v },
              } as unknown as React.ChangeEvent<HTMLInputElement>;
              onChange(synthetic);
            }
          }}
          disabled={disabled}
          min={typeof min === "string" ? min : undefined}
          max={typeof max === "string" ? max : undefined}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          className={className}
        />
      );
    }

    const isPicker = typeof type === "string" && LOCALE_AWARE_TYPES.has(type);
    const effectiveLang = lang ?? (isPicker ? locale : undefined);
    return (
      <input
        ref={ref}
        type={type}
        lang={effectiveLang}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        min={min}
        max={max}
        placeholder={placeholder}
        aria-label={ariaLabel}
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
