"use client";

import { useState, type ReactNode } from "react";

interface SidebarFilterProps {
  title: string;
  /** Children rendered inside the filter body (one block per filter group). */
  children: ReactNode;
  /** Localized "Apply" button label. */
  applyLabel: string;
  /** Localized "Reset" button label. */
  resetLabel: string;
  onApply: () => void;
  onReset: () => void;
}

/**
 * Sticky left-rail filter panel used by the customer list, equipment list,
 * and installation-history pages. Mobile screens collapse it into a
 * toggleable drawer.
 */
export function SidebarFilter({
  title,
  children,
  applyLabel,
  resetLabel,
  onApply,
  onReset,
}: SidebarFilterProps) {
  const [openMobile, setOpenMobile] = useState(false);
  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpenMobile((v) => !v)}
        className="mb-2 inline-flex items-center gap-2 rounded-md border-2 border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 md:hidden"
      >
        <FilterIcon />
        {title}
      </button>
      <aside
        className={`${openMobile ? "block" : "hidden"} md:sticky md:top-16 md:block md:max-h-[calc(100vh-5rem)] md:w-64 md:flex-shrink-0 md:overflow-auto xl:w-72`}
      >
        <div className="rounded-lg border-2 border-gray-200 bg-white p-3">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
          <div className="space-y-3">{children}</div>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onApply}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] hover:bg-blue-700"
            >
              {applyLabel}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="w-full rounded-md border-2 border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300"
            >
              {resetLabel}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 4h18l-7 9v7l-4-2v-5z" />
    </svg>
  );
}
