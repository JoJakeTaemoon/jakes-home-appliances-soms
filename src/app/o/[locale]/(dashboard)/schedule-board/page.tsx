"use client";

/**
 * Track 1 — 오늘의 배정 보드 (/o/schedule-board)
 *
 * Left column: unassigned (SUGGESTED) queue. Each card expands to show
 * the SchedulerWidget for one-click confirm.
 * Right grid: per-technician day columns showing SCHEDULED / IN_PROGRESS
 * / RESCHEDULED visits with time + customer.
 *
 * Office STAFF+ only — the API enforces the same role gate.
 */

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useApiQuery } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { SchedulerWidget } from "@/components/visits/scheduler-widget";
import { VisitTypeBadge, VisitStateBadge } from "@/components/visits/visit-state-badge";
import { pickModelName } from "@/lib/products/name";

interface BoardVisit {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  scheduledWindow: string | null;
  leadTechnicianId?: string | null;
  collaboratorTechnicianIds?: string[];
  customerId?: string;
  siteId?: string | null;
  customer: {
    id: string;
    code: string;
    name: string;
    type: "B2C" | "B2B";
    preferredTechnicianId?: string | null;
    preferredRegion?: string | null;
  };
  equipment: {
    id: string;
    serialNumber: string | null;
    model: {
      modelCode: string | null;
      nameKo: string | null;
      nameVi: string | null;
      nameEn: string | null;
    };
    site: { id: string; name: string; region?: string | null } | null;
  } | null;
}

interface BoardData {
  date: string;
  unassigned: BoardVisit[];
  technicians: Array<{
    id: string;
    username: string;
    preferredRegion: string | null;
    visits: BoardVisit[];
  }>;
}

function todayYmd(): string {
  const d = new Date();
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(yyyymmdd: string, delta: number): string {
  const [y, m, d] = yyyymmdd.split("-").map((p) => parseInt(p, 10));
  const x = new Date(y, m - 1, d + delta);
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function formatHm(iso: string): string {
  return iso.slice(11, 16);
}

function formatDateOnly(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  if (locale === "vi") {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ScheduleBoardPage() {
  const t = useTranslations("scheduleBoard");
  const tv = useTranslations("visits");
  const locale = useLocale();

  const [date, setDate] = useState(todayYmd());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const url = `/api/schedule-board?date=${encodeURIComponent(date)}`;
  const query = useApiQuery<BoardData>(url, { refetchInterval: 30_000 });
  const data = query.data ?? null;

  const totalUnassigned = data?.unassigned.length ?? 0;
  const totalAssignedToday = useMemo(() => {
    if (!data) return 0;
    return data.technicians.reduce((acc, t) => acc + t.visits.length, 0);
  }, [data]);

  const reload = async () => {
    await query.refetch();
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-[#737373]">
            {t("subtitle", {
              unassigned: totalUnassigned,
              assigned: totalAssignedToday,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDate(shiftDay(date, -1))}
          >
            {t("prev")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDate(todayYmd())}
          >
            {t("today")}
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-[#d4d4d4] bg-white px-2 py-1 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDate(shiftDay(date, 1))}
          >
            {t("next")}
          </Button>
        </div>
      </header>

      {query.isLoading && !data ? (
        <p className="text-sm text-[#737373]">{t("loading")}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
        {/* Unassigned queue */}
        <section className="rounded-2xl border border-[#fcd34d] bg-[#fffbeb] p-3">
          <h2 className="text-sm font-semibold text-[#92400e]">
            {t("unassignedTitle", { count: totalUnassigned })}
          </h2>
          {totalUnassigned === 0 ? (
            <p className="mt-2 text-xs text-[#737373]">{t("noUnassigned")}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {(data?.unassigned ?? []).map((v) => {
                const expanded = expandedId === v.id;
                return (
                  <li
                    key={v.id}
                    className="rounded-lg border border-[#fcd34d] bg-white p-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#737373]">
                        {formatDateOnly(v.scheduledFor, locale)} ·{" "}
                        {formatHm(v.scheduledFor)}
                      </span>
                      <VisitTypeBadge type={v.type} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <Link
                        href={`/o/visits/${v.id}`}
                        className="text-sm font-semibold text-[#002A4D] hover:underline"
                      >
                        {v.customer.name}
                        <span className="ml-1 font-mono text-[10px] text-[#737373]">
                          {v.customer.code}
                        </span>
                      </Link>
                      <Button
                        size="sm"
                        variant={expanded ? "secondary" : "primary"}
                        onClick={() =>
                          setExpandedId(expanded ? null : v.id)
                        }
                      >
                        {expanded ? t("close") : t("assign")}
                      </Button>
                    </div>
                    {v.equipment && (
                      <p className="mt-1 text-[10px] text-[#737373]">
                        {pickModelName(v.equipment.model, locale)}
                        {v.equipment.serialNumber
                          ? ` · ${v.equipment.serialNumber}`
                          : ""}
                      </p>
                    )}
                    {expanded && (
                      <div className="mt-2 border-t border-[#fcd34d] pt-2">
                        <SchedulerWidget
                          visitId={v.id}
                          customerId={v.customer.id}
                          siteId={v.equipment?.site?.id ?? null}
                          scheduledFor={v.scheduledFor}
                          state="SUGGESTED"
                          leadTechnicianId={null}
                          collaboratorTechnicianIds={[]}
                          onScheduled={() => {
                            setExpandedId(null);
                            void reload();
                          }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Per-technician columns */}
        <section className="overflow-x-auto rounded-2xl border border-[#e5e5e5] bg-white p-3">
          <div className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-2">
            {(data?.technicians ?? []).map((tech) => (
              <article
                key={tech.id}
                className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-2"
              >
                <header className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#002A4D]">
                      {tech.username}
                    </p>
                    {tech.preferredRegion && (
                      <p className="text-[10px] text-[#737373]">
                        {tech.preferredRegion}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-[var(--brand-blue-50)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-blue-700)]">
                      {t("loadBadge", { n: tech.visits.length })}
                    </span>
                    {tech.visits.length > 0 && (
                      <Link
                        href={`/o/visits/print?date=${date}&technicianId=${tech.id}`}
                        className="rounded border border-[var(--brand-blue-700)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-blue-700)] hover:bg-[var(--brand-blue-50)]"
                      >
                        {t("printBtn")}
                      </Link>
                    )}
                  </div>
                </header>
                {tech.visits.length === 0 ? (
                  <p className="text-[11px] text-[#a3a3a3]">{t("noVisits")}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {tech.visits.map((v) => (
                      <li
                        key={v.id}
                        className="rounded border border-[#e5e5e5] bg-white p-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-[#737373]">
                            {formatHm(v.scheduledFor)}
                            {v.scheduledWindow
                              ? ` · ${v.scheduledWindow}`
                              : ""}
                          </span>
                          <VisitStateBadge state={v.state} />
                        </div>
                        <Link
                          href={`/o/visits/${v.id}`}
                          className="mt-0.5 block text-sm font-medium text-[#002A4D] hover:underline"
                        >
                          {v.customer.name}
                          <span className="ml-1 font-mono text-[10px] text-[#737373]">
                            {v.customer.code}
                          </span>
                        </Link>
                        <p className="mt-0.5 text-[10px] text-[#737373]">
                          {tv(`types.${v.type}` as "types.INSTALLATION")}
                          {v.equipment
                            ? ` · ${pickModelName(v.equipment.model, locale)}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
            {(data?.technicians?.length ?? 0) === 0 && !query.isLoading ? (
              <p className="text-sm text-[#737373]">{t("noTechnicians")}</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
