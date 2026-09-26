"use client";

/**
 * Multi-select sibling of `Combobox` — same trigger size, same portaled
 * search panel, same inline "+ 추가" row. Built for 제품군, which a model,
 * a 제품 유형, a consumable and an accessory can each carry several of.
 *
 * Picking an option toggles it and keeps the panel open, so several can be
 * chosen in one pass. Selected values show as removable chips in the
 * trigger. Options may be `disabled` (e.g. 제품군 outside the chosen 제품
 * 유형) — a disabled option that is already selected can still be removed.
 *
 * The positioning and outside-click effects mirror `Combobox`; the panel
 * itself is its exported `PortalPanel`.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { foldDiacritics } from "@/lib/vn-text";
import { PortalPanel, type ComboboxOption, type Coords } from "@/components/ui/combobox";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  allowCreate?: boolean;
  createLabel?: (query: string) => string;
  onCreate?: (query: string) => void;
  minDropdownWidth?: number;
}

export function MultiCombobox({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results",
  disabled,
  className,
  ariaLabel,
  allowCreate = false,
  createLabel = (q) => `Add “${q}”`,
  onCreate,
  minDropdownWidth = 320,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Closing always forgets the search, so the next open shows every option —
  // same as Combobox, which clears it on pick.
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const selectedSet = useMemo(() => new Set(values), [values]);
  // Keep the chips in the order the options are listed, not click order.
  const selected = useMemo(
    () => options.filter((o) => selectedSet.has(o.value)),
    [options, selectedSet],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = foldDiacritics(query.trim());
    return options.filter(
      (o) =>
        foldDiacritics(o.label).includes(q) ||
        (o.description ? foldDiacritics(o.description).includes(q) : false),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const recompute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const flipUp = spaceBelow < 280 && r.top > spaceBelow;
      setCoords({
        top: flipUp ? r.top - 4 : r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, minDropdownWidth),
        flipUp,
      });
    };
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open, minDropdownWidth, values.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    // Window + capture: runs before a surrounding Modal's `document` listener,
    // so Esc closes only this panel, never the dialog it sits in.
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    window.addEventListener("keydown", keyHandler, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keyHandler, true);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(selectedSet.has(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  const exactMatch = filtered.some(
    (o) => o.label.toLowerCase() === query.trim().toLowerCase(),
  );

  return (
    <div className={cn("relative", className)}>
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else setOpen(true);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#e5e5e5] bg-white px-2 py-1 text-left text-sm",
          "focus:border-[var(--brand-blue-500)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue-200)]",
          disabled && "cursor-not-allowed bg-[#fafafa] text-[#737373]",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 && (
            <span className="px-1 text-[#a3a3a3]">{placeholder}</span>
          )}
          {selected.map((o) => (
            <span
              key={o.value}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--brand-blue-50)] px-2 py-0.5 text-xs font-medium text-[var(--brand-blue-700)]"
            >
              <span className="truncate">{o.label}</span>
              {!disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${o.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(o.value);
                    }
                  }}
                  className="rounded text-[var(--brand-blue-500)] hover:text-[var(--brand-blue-700)]"
                >
                  ×
                </span>
              )}
            </span>
          ))}
        </div>
        <svg
          className="shrink-0 text-[#737373]"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {mounted && open && coords && createPortal(
        <PortalPanel panelRef={dropdownRef} coords={coords} minWidth={minDropdownWidth}>
          <div className="border-b border-[#f5f5f5] p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-md border border-[#e5e5e5] bg-white px-3 text-sm outline-none focus:border-[var(--brand-blue-500)]"
            />
          </div>
          <div id={listboxId} role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && !(allowCreate && query.trim()) && (
              <div className="px-3 py-4 text-center text-xs text-[#a3a3a3]">{emptyText}</div>
            )}
            {filtered.map((o) => {
              const checked = selectedSet.has(o.value);
              // A disabled option stays removable if it is already picked.
              const inert = o.disabled && !checked;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={inert}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-[#f5f5f5]",
                    checked && "bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]",
                    inert && "cursor-not-allowed opacity-50 hover:bg-transparent",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                      checked
                        ? "border-[var(--brand-blue-500)] bg-[var(--brand-blue-500)] text-white"
                        : "border-[#d4d4d4] bg-white",
                    )}
                  >
                    {checked ? "✓" : ""}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{o.label}</span>
                    {o.description && (
                      <span className="text-xs text-[#737373]">{o.description}</span>
                    )}
                  </span>
                </button>
              );
            })}
            {allowCreate && onCreate && query.trim() && !exactMatch && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  const q = query.trim();
                  if (!q) return;
                  onCreate(q);
                  close();
                }}
                className="flex w-full items-center gap-1 border-t border-[#f0f0f0] px-3 py-2 text-left text-sm text-[var(--brand-blue-700)] hover:bg-[var(--brand-blue-50)]"
              >
                <span className="font-semibold">+</span>
                <span className="truncate">{createLabel(query.trim())}</span>
              </button>
            )}
          </div>
        </PortalPanel>,
        document.body,
      )}
    </div>
  );
}
