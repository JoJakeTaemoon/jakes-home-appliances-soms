"use client";

/**
 * Custom calendar picker — replaces the native `<input type="date">`
 * everywhere. The native control has three fatal problems for us:
 *
 *   1. Its popover follows the browser's OS locale (not our app
 *      locale) — Chromium/Safari partially fix this via the `lang`
 *      attribute, Firefox ignores it.
 *   2. The chrome (month/weekday labels, [삭제]/[오늘] buttons) can't
 *      be styled or translated.
 *   3. Behavior varies by browser + OS combination, so QA becomes an
 *      N×M matrix.
 *
 * This component is a fully-controlled React calendar: pure DOM we
 * render, so it looks and behaves identically on Chrome, Safari,
 * Firefox, and mobile. Locale-aware month + weekday names come from
 * `Intl.DateTimeFormat` via next-intl's active `useLocale()`.
 *
 * Value is a plain `YYYY-MM-DD` ISO date string. Empty string means
 * "no value". Dates are calendar-only — no time, no TZ.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** ISO min (`YYYY-MM-DD`). Selecting an earlier date is blocked. */
  min?: string;
  /** ISO max (`YYYY-MM-DD`). Selecting a later date is blocked. */
  max?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Show a small × button when a value is set. Default true. */
  clearable?: boolean;
  /** 0 = Sunday, 1 = Monday. Default 1 (ISO week). */
  weekStart?: 0 | 1;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function parseYmd(v: string): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!parsed) return null;
  return {
    y: Number(parsed[1]),
    m: Number(parsed[2]) - 1,
    d: Number(parsed[3]),
  };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function todayYmd(): string {
  const d = new Date();
  return toYmd(d.getFullYear(), d.getMonth(), d.getDate());
}

function isWithin(v: string, min?: string, max?: string): boolean {
  if (min && v < min) return false;
  if (max && v > max) return false;
  return true;
}

function useWeekdayNames(locale: string, weekStart: 0 | 1): string[] {
  return useMemo(() => {
    // Base is a known Sunday (2024-01-07) so we can generate the week
    // in the right order regardless of `weekStart`.
    const base = new Date(2024, 0, 7);
    const raw: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      raw.push(new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d));
    }
    return weekStart === 1 ? [...raw.slice(1), raw[0]] : raw;
  }, [locale, weekStart]);
}

function useMonthLabel(y: number, m: number, locale: string): string {
  return useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
      }).format(new Date(y, m, 1)),
    [y, m, locale],
  );
}

interface CalendarCell {
  y: number;
  m: number;
  d: number;
  ymd: string;
  inMonth: boolean;
}

function useCalendarGrid(
  y: number,
  m: number,
  weekStart: 0 | 1,
): CalendarCell[] {
  return useMemo(() => {
    const first = new Date(y, m, 1);
    const firstDow = (first.getDay() - weekStart + 7) % 7;
    const cells: CalendarCell[] = [];
    // Prev-month tail
    const prevLast = new Date(y, m, 0);
    const prevY = prevLast.getFullYear();
    const prevM = prevLast.getMonth();
    const prevD = prevLast.getDate();
    for (let i = firstDow - 1; i >= 0; i--) {
      const d = prevD - i;
      cells.push({ y: prevY, m: prevM, d, ymd: toYmd(prevY, prevM, d), inMonth: false });
    }
    // Current month
    const dim = daysInMonth(y, m);
    for (let d = 1; d <= dim; d++) {
      cells.push({ y, m, d, ymd: toYmd(y, m, d), inMonth: true });
    }
    // Next-month head
    const nextY = m === 11 ? y + 1 : y;
    const nextM = (m + 1) % 12;
    let nextD = 1;
    while (cells.length < 42) {
      cells.push({
        y: nextY,
        m: nextM,
        d: nextD,
        ymd: toYmd(nextY, nextM, nextD),
        inMonth: false,
      });
      nextD += 1;
    }
    return cells;
  }, [y, m, weekStart]);
}

interface Coords {
  top: number;
  left: number;
  width: number;
  flipUp: boolean;
}

const POPOVER_MIN_WIDTH = 300;

export function DatePicker({
  value,
  onChange,
  disabled,
  min,
  max,
  placeholder = "—",
  className,
  ariaLabel,
  clearable = true,
  weekStart = 1,
}: Readonly<Props>) {
  const locale = useLocale();
  const t = useTranslations("common");

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const parsed = parseYmd(value);
  const [viewY, setViewY] = useState<number>(
    parsed?.y ?? new Date().getFullYear(),
  );
  const [viewM, setViewM] = useState<number>(
    parsed?.m ?? new Date().getMonth(),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // When the value changes externally, re-anchor the calendar view.
  useEffect(() => {
    const p = parseYmd(value);
    if (p) {
      setViewY(p.y);
      setViewM(p.m);
    }
  }, [value]);

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
      const spaceAbove = r.top;
      const flipUp = spaceBelow < 320 && spaceAbove > spaceBelow;
      setCoords({
        top: flipUp ? r.top - 4 : r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, POPOVER_MIN_WIDTH),
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const weekdayNames = useWeekdayNames(locale, weekStart);
  const monthLabel = useMonthLabel(viewY, viewM, locale);
  const grid = useCalendarGrid(viewY, viewM, weekStart);

  const label = value ? formatDate(value, locale) : placeholder;
  const today = todayYmd();

  const goPrev = () => {
    if (viewM === 0) {
      setViewY(viewY - 1);
      setViewM(11);
    } else {
      setViewM(viewM - 1);
    }
  };
  const goNext = () => {
    if (viewM === 11) {
      setViewY(viewY + 1);
      setViewM(0);
    } else {
      setViewM(viewM + 1);
    }
  };
  const pick = (ymd: string) => {
    if (!isWithin(ymd, min, max)) return;
    onChange(ymd);
    setOpen(false);
  };
  const pickToday = () => {
    if (!isWithin(today, min, max)) return;
    onChange(today);
    const p = parseYmd(today);
    if (p) {
      setViewY(p.y);
      setViewM(p.m);
    }
    setOpen(false);
  };
  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div className={cn("relative inline-flex w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-[#e5e5e5] bg-white px-3 text-left text-sm text-[#111111]",
          "hover:border-[var(--brand-blue-300)]",
          "focus:border-[var(--brand-blue-500)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue-200)]",
          disabled && "cursor-not-allowed bg-[#fafafa] text-[#737373]",
          !value && "text-[#a3a3a3]",
        )}
      >
        <span className="truncate">{label}</span>
        <div className="flex items-center gap-1">
          {clearable && value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("clear")}
              onClick={clear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="rounded p-0.5 text-[#a3a3a3] hover:bg-[#f5f5f5] hover:text-[#525252]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
      </button>

      {mounted && open && coords && createPortal(
        <PopoverPanel
          ref={popoverRef}
          coords={coords}
          minWidth={POPOVER_MIN_WIDTH}
        >
          <div className="px-3 py-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goPrev}
                className="rounded p-1 text-[#525252] hover:bg-[#f5f5f5]"
                aria-label={t("prev")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="text-sm font-medium text-[#111111]">
                {monthLabel}
              </div>
              <button
                type="button"
                onClick={goNext}
                className="rounded p-1 text-[#525252] hover:bg-[#f5f5f5]"
                aria-label={t("next")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-[#a3a3a3]">
              {weekdayNames.map((w, i) => (
                <div key={`${w}-${i}`}>{w}</div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-0.5">
              {grid.map((c) => {
                const selected = c.ymd === value;
                const isToday = c.ymd === today;
                const blocked = !isWithin(c.ymd, min, max);
                return (
                  <button
                    key={c.ymd}
                    type="button"
                    onClick={() => pick(c.ymd)}
                    disabled={blocked}
                    className={cn(
                      "h-8 rounded text-xs",
                      selected
                        ? "bg-[var(--brand-blue-500)] font-semibold text-white"
                        : c.inMonth
                          ? "text-[#111111] hover:bg-[var(--brand-blue-50)]"
                          : "text-[#d4d4d4] hover:bg-[#f5f5f5]",
                      isToday && !selected && "ring-1 ring-inset ring-[var(--brand-blue-300)]",
                      blocked && "cursor-not-allowed opacity-40 hover:bg-transparent",
                    )}
                  >
                    {c.d}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-[#f5f5f5] pt-2 text-xs">
              <button
                type="button"
                onClick={pickToday}
                className="rounded px-2 py-1 text-[var(--brand-blue-700)] hover:bg-[var(--brand-blue-50)]"
              >
                {t("today")}
              </button>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="rounded px-2 py-1 text-[#737373] hover:bg-[#f5f5f5]"
                >
                  {t("clear")}
                </button>
              )}
            </div>
          </div>
        </PopoverPanel>,
        document.body,
      )}
    </div>
  );
}

interface PopoverPanelProps {
  coords: Coords;
  minWidth: number;
  children: React.ReactNode;
}

const PopoverPanel = (() => {
  function Panel(
    { coords, minWidth, children }: Readonly<PopoverPanelProps>,
    ref: React.ForwardedRef<HTMLDivElement>,
  ) {
    const viewportW =
      typeof globalThis.window === "undefined"
        ? 1024
        : globalThis.window.innerWidth;
    const width = Math.min(
      Math.max(coords.width, minWidth),
      Math.max(minWidth, viewportW - 16),
    );
    const left = Math.max(
      8,
      Math.min(coords.left, viewportW - width - 8),
    );
    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          top: coords.top,
          left,
          width,
          transform: coords.flipUp ? "translateY(-100%)" : undefined,
          zIndex: 50,
        }}
        className="overflow-hidden rounded-lg border border-[#e5e5e5] bg-white shadow-lg"
      >
        {children}
      </div>
    );
  }
  Panel.displayName = "DatePickerPopover";
  return Object.assign(
    (
      props: PopoverPanelProps & { ref?: React.Ref<HTMLDivElement> },
    ) => Panel(props, props.ref ?? null),
    { displayName: "DatePickerPopover" },
  );
})();
