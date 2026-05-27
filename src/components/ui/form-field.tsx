"use client";

import { cn } from "@/lib/cn";

interface Props {
  label: React.ReactNode;
  /** Field name used to wire the label htmlFor and error id. */
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}

/**
 * Form field wrapper: label + control + error message.
 * Use with react-hook-form by passing `error={errors.field?.message}`.
 */
export function FormField({ label, htmlFor, required, hint, error, className, children }: Readonly<Props>) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#525252]">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-[#737373]">{hint}</p>}
      {error && (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
