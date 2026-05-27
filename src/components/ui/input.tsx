"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
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
