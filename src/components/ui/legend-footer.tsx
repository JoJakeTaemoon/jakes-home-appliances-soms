"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface LegendItem {
  /** 1-based area number shown in the circled badge. */
  n: number;
  title: string;
  body: string;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

/**
 * Numbered area-explanation footer (①~⑤) matching the client's desktop-ERP
 * mockups. Collapsible (default hidden) so the help text doesn't add standing
 * visual density to an already data-dense screen — the user reveals it on demand.
 */
export function LegendFooter({
  items,
  label = "① ~ ⑤",
  className,
}: {
  items: LegendItem[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-xl border border-[#e5e5e5] bg-[#fafafa]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs font-semibold text-[#586a7c] hover:text-[#111]"
      >
        <span aria-hidden className={cn("transition-transform", open && "rotate-90")}>
          ▸
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <div className="grid gap-x-6 gap-y-4 border-t border-[#e5e5e5] px-4 py-4 text-sm sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {items.map((it) => (
            <div key={it.n}>
              <div className="flex items-center gap-1.5 font-semibold text-[var(--brand-blue,#1f6feb)]">
                <span aria-hidden>{CIRCLED[it.n - 1] ?? it.n}</span>
                <span>{it.title}</span>
              </div>
              <p className="mt-1 leading-snug text-[#586a7c]">{it.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
