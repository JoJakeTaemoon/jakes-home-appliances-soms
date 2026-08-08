"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { foldDiacritics } from "@/lib/vn-text";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  placeholder?: string;
  /** Show the search input always (default true when options > 5). */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  emptyText?: string;
  /** Aria label for the trigger when no label is wired via FormField. */
  ariaLabel?: string;
  /**
   * When true, callers receive a `Create "<query>"` row whenever the
   * search query doesn't match any option. Pair with `onCreate` to
   * handle free-text entries (parts list in the visit completion flow).
   */
  allowCreate?: boolean;
  /** Label template for the create row. Receives the typed query. */
  createLabel?: (query: string) => string;
  /** Fires when the user picks the "Create" row. */
  onCreate?: (query: string) => void;
  /** Minimum dropdown width in px. Defaults to 320; raise for dense option labels. */
  minDropdownWidth?: number;
}

interface Coords {
  top: number;
  left: number;
  width: number;
  flipUp: boolean;
}

/**
 * Custom dropdown with built-in search. No native <select>, no shadcn.
 *
 * The popover renders via React portal to `document.body` so it escapes
 * narrow table cells, `overflow:auto` scrollers, and stacking contexts.
 * Position is recomputed on scroll/resize so the dropdown tracks the
 * trigger; the panel auto-flips above when there isn't room below.
 *
 * Per CLAUDE.md: search must be enabled when options > 5; we auto-enable
 * unless the caller explicitly passes `searchable={false}`.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable,
  searchPlaceholder = "Search…",
  disabled,
  className,
  allowClear = true,
  emptyText = "No results",
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const showSearch = searchable ?? options.length > 5;

  useEffect(() => {
    setMounted(true);
  }, []);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  // Diacritic-insensitive search: fold both query and option so plain-ASCII
  // typing ("Ho Chi") matches accented Vietnamese ("Thành phố Hồ Chí Minh").
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = foldDiacritics(query.trim());
    return options.filter(
      (o) =>
        foldDiacritics(o.label).includes(q) ||
        (o.description ? foldDiacritics(o.description).includes(q) : false) ||
        foldDiacritics(o.value).includes(q),
    );
  }, [options, query]);

  // Track trigger position. Recompute on scroll (capture: true catches
  // nested overflow scrollers such as the table's overflow-x-auto wrapper)
  // and on resize so the dropdown always follows the trigger.
  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const recompute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const desiredWidth = Math.max(r.width, minDropdownWidth);
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const flipUp = spaceBelow < 280 && spaceAbove > spaceBelow;
      setCoords({
        top: flipUp ? r.top - 4 : r.bottom + 4,
        left: r.left,
        width: desiredWidth,
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
  }, [open, minDropdownWidth]);

  // Outside click — closes when click lands outside both the trigger and
  // the portaled dropdown panel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Escape closes the dropdown and is swallowed here, so a global Esc hotkey
    // (ActionBar 닫기) can't also fire and reset the form behind it.
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-[#e5e5e5] bg-white px-3 text-left text-sm",
          "focus:border-[var(--brand-blue-500)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue-200)]",
          disabled && "cursor-not-allowed bg-[#fafafa] text-[#737373]",
        )}
      >
        <span className={cn(selected ? "text-[#111111]" : "text-[#a3a3a3]", "truncate")}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="rounded p-0.5 text-[#a3a3a3] hover:bg-[#f5f5f5] hover:text-[#525252]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          )}
          <svg
            className="text-[#737373]"
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
      </button>

      {mounted && open && coords && createPortal(
        <PortalPanel
          panelRef={dropdownRef}
          coords={coords}
          minWidth={minDropdownWidth}
        >
          {showSearch && (
            <div className="border-b border-[#f5f5f5] p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-[#e5e5e5] bg-white px-3 text-sm outline-none focus:border-[var(--brand-blue-500)]"
              />
            </div>
          )}
          <div role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-[#a3a3a3]">{emptyText}</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={value === o.value}
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[#f5f5f5]",
                  value === o.value && "bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]",
                  o.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <span className="font-medium">{o.label}</span>
                {o.description && (
                  <span className="text-xs text-[#737373]">{o.description}</span>
                )}
              </button>
            ))}
            {/*
              Free-text "create" row. Shown when allowCreate is on AND the
              typed query doesn't already match an existing option label.
              Lets callers (e.g. the parts list in the visit-completion
              wizard) accept off-catalog items without leaving the field.
            */}
            {allowCreate && onCreate && query.trim() && !filtered.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  const q = query.trim();
                  if (!q) return;
                  onCreate(q);
                  setOpen(false);
                  setQuery("");
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

interface PortalPanelProps {
  coords: Coords;
  minWidth: number;
  panelRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

function PortalPanel({ coords, minWidth, panelRef, children }: Readonly<PortalPanelProps>) {
  // Clamp horizontally so the panel stays in the viewport even when the
  // trigger sits near the right edge.
  const viewportW = typeof globalThis.window === "undefined" ? 1024 : globalThis.window.innerWidth;
  const desiredWidth = Math.max(coords.width, minWidth);
  const maxWidth = Math.max(minWidth, viewportW - 16);
  const width = Math.min(desiredWidth, maxWidth);
  const left = Math.max(8, Math.min(coords.left, viewportW - width - 8));
  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: coords.top,
        left,
        width,
        maxWidth,
        transform: coords.flipUp ? "translateY(-100%)" : undefined,
        zIndex: 50,
      }}
      className="overflow-hidden rounded-lg border border-[#e5e5e5] bg-white shadow-lg"
    >
      {children}
    </div>
  );
}
