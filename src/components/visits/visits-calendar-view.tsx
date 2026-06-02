"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useApiPageQuery } from "@/lib/api/hooks";
import { Modal } from "@/components/ui/modal";
import {
  VisitStateBadge,
  VisitTypeBadge,
} from "@/components/visits/visit-state-badge";
import { pickModelName } from "@/lib/products/name";

interface CalendarVisit {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  scheduledWindow: string | null;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  leadTechnician: { id: string; username: string } | null;
  equipment: {
    id: string;
    serialNumber: string | null;
    model: {
      modelCode: string | null;
      nameKo: string | null;
      nameVi: string | null;
      nameEn: string | null;
    };
  } | null;
}

const STATE_DOT: Record<string, string> = {
  SUGGESTED: "bg-[#a3a3a3]",
  SCHEDULED: "bg-[var(--brand-blue-500)]",
  IN_PROGRESS: "bg-amber-500",
  COMPLETED: "bg-emerald-500",
  FAILED_NO_SHOW: "bg-red-500",
  RESCHEDULED: "bg-amber-500",
  CANCELLED: "bg-[#a3a3a3]",
};

const STATE_BAR: Record<string, string> = {
  SUGGESTED: "bg-[#f5f5f5] text-[#525252]",
  SCHEDULED: "bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED_NO_SHOW: "bg-red-50 text-red-700",
  RESCHEDULED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-[#f5f5f5] text-[#a3a3a3] line-through",
};

const VISIBLE_PER_DAY = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function localDateKey(d: Date): string {
  // YYYY-MM-DD in *local* time (not UTC) so we bucket visits the way
  // the user sees them.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 42-cell grid covering the month: starts at the Sunday on/before the 1st,
 * ends at the Saturday on/after the last day. Always 6 rows × 7 cols so
 * the layout doesn't jump between months.
 */
function buildMonthCells(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay()); // back to Sunday
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getTime() + i * MS_PER_DAY));
  }
  return cells;
}

export function VisitsCalendarView() {
  const t = useTranslations("visits");
  const locale = useLocale();
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const cells = useMemo(() => buildMonthCells(anchor), [anchor]);

  // Fetch one month at a time (grid range, not just calendar month) so the
  // leading/trailing days of adjacent months also show their visits.
  const range = useMemo(() => {
    const from = cells[0];
    const last = cells.at(-1) ?? from;
    const to = new Date(last.getTime() + MS_PER_DAY);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [cells]);

  const url = useMemo(() => {
    const sp = new URLSearchParams({
      from: range.from,
      to: range.to,
      sortBy: "scheduledFor",
      sortDir: "asc",
      // 6 weeks × 7 days = 42 days; allow up to ~10 visits per day on
      // average before truncation kicks in (most days have ≤5).
      pageSize: "500",
    });
    return `/api/visits?${sp.toString()}`;
  }, [range.from, range.to]);

  const query = useApiPageQuery<CalendarVisit[]>(url);
  const visits = query.data?.data ?? [];

  // Group visits by local date key for O(1) lookup per cell.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarVisit[]>();
    for (const v of visits) {
      const key = localDateKey(new Date(v.scheduledFor));
      const list = m.get(key);
      if (list) list.push(v);
      else m.set(key, [v]);
    }
    return m;
  }, [visits]);

  const todayKey = localDateKey(new Date());
  const monthIndex = anchor.getMonth();
  const weekdays = t("calendarWeekdays").split(",");

  // next-intl locale codes → BCP-47 tags for Intl.DateTimeFormat.
  const BCP47: Record<string, string> = { ko: "ko-KR", vi: "vi-VN", en: "en-US" };
  const intlLocale = BCP47[locale] ?? "en-US";

  const monthLabel = new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    month: "long",
  }).format(anchor);

  const dayLabel = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(intlLocale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(new Date(y, m - 1, d));
  };

  const openDayVisits = openDay ? byDay.get(openDay) ?? [] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("calendarPrev")}
            onClick={() => setAnchor((a) => addMonths(a, -1))}
            className="h-9 rounded-md border border-[#e5e5e5] bg-white px-3 text-sm font-medium text-[#525252] hover:border-[#a3a3a3]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAnchor(startOfMonth(new Date()))}
            className="h-9 rounded-md border border-[#e5e5e5] bg-white px-3 text-xs font-medium text-[#525252] hover:border-[#a3a3a3]"
          >
            {t("calendarToday")}
          </button>
          <button
            type="button"
            aria-label={t("calendarNext")}
            onClick={() => setAnchor((a) => addMonths(a, 1))}
            className="h-9 rounded-md border border-[#e5e5e5] bg-white px-3 text-sm font-medium text-[#525252] hover:border-[#a3a3a3]"
          >
            ›
          </button>
          <h2 className="ml-2 text-base font-semibold text-[#002A4D]">
            {monthLabel}
          </h2>
        </div>
        {query.isLoading && (
          <span className="text-xs text-[#a3a3a3]">{t("loadingRecommend")}</span>
        )}
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
        {weekdays.map((w, i) => {
          let weekdayColor = "text-[#737373]";
          if (i === 0) weekdayColor = "text-red-600";
          else if (i === 6) weekdayColor = "text-[var(--brand-blue-700)]";
          return (
            <div
              key={w}
              className={`border-b border-[#f0f0f0] bg-[#fafafa] px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider ${weekdayColor}`}
            >
              {w}
            </div>
          );
        })}
        {cells.map((cell, i) => {
          const key = localDateKey(cell);
          const isOutside = cell.getMonth() !== monthIndex;
          const isToday = key === todayKey;
          const dayVisits = byDay.get(key) ?? [];
          const isWeekStart = i % 7 === 0;
          const isFirstRow = i < 7;
          return (
            <button
              key={key}
              type="button"
              onClick={() => dayVisits.length > 0 && setOpenDay(key)}
              className={[
                "min-h-[110px] border-[#f0f0f0] p-1.5 text-left transition-colors",
                isFirstRow ? "" : "border-t",
                isWeekStart ? "" : "border-l",
                isOutside ? "bg-[#fafafa]" : "bg-white hover:bg-[#fafafa]",
                dayVisits.length === 0 ? "cursor-default" : "cursor-pointer",
              ].join(" ")}
            >
              <div className="mb-1 flex items-center gap-1">
                {(() => {
                  let dayColor = "text-[#262626]";
                  if (isToday) dayColor = "bg-[var(--brand-blue-500)] text-white";
                  else if (isOutside) dayColor = "text-[#d4d4d4]";
                  return (
                    <span
                      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full text-[11px] font-semibold ${dayColor}`}
                    >
                      {cell.getDate()}
                    </span>
                  );
                })()}
                {dayVisits.length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-[#737373]">
                    <span className={`size-1.5 rounded-full ${STATE_DOT[dayVisits[0].state] ?? "bg-[#a3a3a3]"}`} />
                    {dayVisits.length}
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-0.5">
                {dayVisits.slice(0, VISIBLE_PER_DAY).map((v) => {
                  const time = v.scheduledFor.slice(11, 16);
                  return (
                    <li key={v.id}>
                      <span
                        className={[
                          "block truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                          STATE_BAR[v.state] ?? "bg-[#f5f5f5] text-[#525252]",
                        ].join(" ")}
                        title={`${time} · ${v.customer.name}`}
                      >
                        <span className="font-mono">{time}</span> · {v.customer.name}
                      </span>
                    </li>
                  );
                })}
                {dayVisits.length > VISIBLE_PER_DAY && (
                  <li className="px-1 text-[10px] font-medium text-[#737373]">
                    {t("calendarMore", { count: dayVisits.length - VISIBLE_PER_DAY })}
                  </li>
                )}
              </ul>
            </button>
          );
        })}
      </div>

      {!query.isLoading && visits.length === 0 && (
        <p className="px-2 text-sm text-[#737373]">{t("calendarEmpty")}</p>
      )}

      <Modal
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        title={openDay ? t("calendarDayVisits", { date: dayLabel(openDay) }) : ""}
        size="md"
      >
        {openDayVisits.length === 0 ? (
          <p className="text-sm text-[#737373]">{t("noVisits")}</p>
        ) : (
          <ul className="divide-y divide-[#f0f0f0]">
            {openDayVisits.map((v) => {
              const time = v.scheduledFor.slice(11, 16);
              const equipmentLabel = v.equipment
                ? pickModelName(v.equipment.model, locale)
                : null;
              return (
                <li key={v.id}>
                  <Link
                    href={`/o/visits/${v.id}` as never}
                    onClick={() => setOpenDay(null)}
                    className="flex items-start gap-3 py-2 hover:bg-[#fafafa]"
                  >
                    <span className="mt-0.5 font-mono text-sm font-semibold text-[var(--brand-blue-700)]">
                      {time}
                    </span>
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[#262626]">
                          {v.customer.name}
                        </span>
                        <span className="font-mono text-xs text-[#a3a3a3]">
                          {v.customer.code}
                        </span>
                        <VisitTypeBadge type={v.type} />
                        <VisitStateBadge state={v.state} />
                      </div>
                      <div className="text-xs text-[#737373]">
                        {equipmentLabel ?? "—"}
                        {v.leadTechnician
                          ? ` · ${v.leadTechnician.username}`
                          : ""}
                        {v.scheduledWindow ? ` · ${v.scheduledWindow}` : ""}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </div>
  );
}
