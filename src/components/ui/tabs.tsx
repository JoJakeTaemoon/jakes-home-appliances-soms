"use client";

import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/cn";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ defaultValue, value: controlled, onValueChange, className, children }: Readonly<TabsProps>) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const setValue = (v: string) => {
    if (controlled === undefined) setInternal(v);
    onValueChange?.(v);
  };
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }: Readonly<{ className?: string; children: React.ReactNode }>) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-[#e5e5e5]",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface TabProps {
  value: string;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function Tab({ value, className, children, disabled }: Readonly<TabProps>) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab must be inside <Tabs>");
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => !disabled && ctx.setValue(value)}
      className={cn(
        "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-[var(--brand-blue-500)] text-[var(--brand-blue-700)]"
          : "border-transparent text-[#737373] hover:text-[#111111]",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, className, children }: Readonly<{ value: string; className?: string; children: React.ReactNode }>) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabPanel must be inside <Tabs>");
  if (ctx.value !== value) return null;
  return <div role="tabpanel" className={className}>{children}</div>;
}
