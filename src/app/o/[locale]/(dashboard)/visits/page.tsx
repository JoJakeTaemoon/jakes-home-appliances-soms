"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApiPageQuery, useApiQuery } from "@/lib/api/hooks";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  VisitStateBadge,
  VisitTypeBadge,
} from "@/components/visits/visit-state-badge";
import { VisitsCalendarView } from "@/components/visits/visits-calendar-view";
import { SchedulerWidget } from "@/components/visits/scheduler-widget";
import { formatDate } from "@/lib/format";

interface VisitRow {
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
    model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  } | null;
}

const PAGE_SIZE = 25;
type ViewMode = "calendar" | "list" | "unassigned";

function resolveInitialView(raw: string | null): ViewMode {
  if (raw === "list") return "list";
  if (raw === "unassigned") return "unassigned";
  return "calendar";
}

function urlForView(v: ViewMode): string {
  if (v === "list") return "/o/visits?view=list";
  if (v === "unassigned") return "/o/visits?view=unassigned";
  return "/o/visits";
}

export default function VisitsListPage() {
  const t = useTranslations("visits");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Calendar is the default view. `?view=list` / `?view=unassigned`
  // survive reloads + bookmarks.
  const initialView: ViewMode = resolveInitialView(searchParams.get("view"));
  const [view, setView] = useState<ViewMode>(initialView);
  useEffect(() => {
    const current = searchParams.get("view");
    const target = urlForView(view);
    const wantQuery = target.includes("?") ? target.split("?")[1] : "";
    const haveQuery = current ? `view=${current}` : "";
    if (wantQuery !== haveQuery) {
      router.replace(target);
    }
  }, [view, searchParams, router]);

  // Unread-style badge count for the "미배정" tab — refetched every 60s.
  const unassignedCountQuery = useApiPageQuery<VisitRow[]>(
    "/api/visits?state=SUGGESTED&page=1&pageSize=1",
  );
  const unassignedCount =
    (unassignedCountQuery.data?.pagination as { total?: number } | undefined)
      ?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <ViewToggle
            value={view}
            onChange={setView}
            unassignedCount={unassignedCount}
          />
          <Link href="/o/visits/new">
            <Button>{t("newVisit")}</Button>
          </Link>
        </div>
      </header>

      {view === "calendar" && <VisitsCalendarView />}
      {view === "list" && <ListView />}
      {view === "unassigned" && <UnassignedView />}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
  unassignedCount,
}: Readonly<{
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  unassignedCount: number;
}>) {
  const t = useTranslations("visits");
  const btn = (target: ViewMode, label: React.ReactNode, key: string) => (
    <button
      key={key}
      role="tab"
      type="button"
      aria-selected={value === target}
      onClick={() => onChange(target)}
      className={[
        "h-8 rounded px-3 text-xs font-medium transition-colors",
        value === target
          ? "bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]"
          : "text-[#737373] hover:text-[#262626]",
      ].join(" ")}
    >
      {label}
    </button>
  );
  return (
    <div
      role="tablist"
      aria-label={t("viewCalendar")}
      className="inline-flex rounded-md border border-[#e5e5e5] bg-white p-0.5"
    >
      {btn("calendar", t("viewCalendar"), "calendar")}
      {btn("list", t("viewList"), "list")}
      {btn(
        "unassigned",
        <span className="inline-flex items-center gap-1">
          {t("viewUnassigned")}
          {unassignedCount > 0 && (
            <span className="rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[10px] font-semibold text-[#92400e]">
              {unassignedCount}
            </span>
          )}
        </span>,
        "unassigned",
      )}
    </div>
  );
}

function ListView() {
  const t = useTranslations("visits");
  const locale = useLocale();
  const router = useRouter();

  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "scheduledFor",
    direction: "asc",
  });

  const url = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("pageSize", String(PAGE_SIZE));
    if (stateFilter) sp.set("state", stateFilter);
    if (typeFilter) sp.set("type", typeFilter);
    if (from) sp.set("from", new Date(from).toISOString());
    if (to) sp.set("to", new Date(to).toISOString());
    if (sort) {
      sp.set("sortBy", sort.column);
      sp.set("sortDir", sort.direction);
    }
    return `/api/visits?${sp.toString()}`;
  }, [page, stateFilter, typeFilter, from, to, sort]);

  const query = useApiPageQuery<VisitRow[]>(url);
  const rows = query.data?.data ?? [];
  const total = (query.data?.pagination as { total?: number } | undefined)?.total ?? rows.length;
  const loading = query.isLoading;

  const columns: Column<VisitRow>[] = [
    {
      key: "scheduledFor",
      header: t("scheduledFor"),
      sortKey: "scheduledFor",
      cell: (r) => (
        <div className="flex flex-col">
          <span>{formatDate(r.scheduledFor, locale)}</span>
          <span className="text-xs text-[#737373]">
            {r.scheduledFor.slice(11, 16)}
            {r.scheduledWindow ? ` · ${r.scheduledWindow}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "customer",
      header: t("customer"),
      sortKey: "customer",
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.customer.name}</span>
          <span className="font-mono text-xs text-[#737373]">{r.customer.code}</span>
        </div>
      ),
    },
    { key: "type", header: t("type"), sortKey: "type", cell: (r) => <VisitTypeBadge type={r.type} /> },
    { key: "state", header: t("state"), sortKey: "state", cell: (r) => <VisitStateBadge state={r.state} /> },
    {
      key: "tech",
      header: t("lead"),
      sortKey: "technician",
      cell: (r) =>
        r.leadTechnician?.username ? (
          <span className="text-sm">{r.leadTechnician.username}</span>
        ) : (
          <span className="text-xs text-[#a3a3a3]">—</span>
        ),
    },
    {
      key: "equipment",
      header: t("equipment"),
      cell: (r) =>
        r.equipment ? (
          <div className="flex flex-col">
            <span className="font-mono text-xs">{pickModelName(r.equipment.model, locale)}</span>
            <span className="text-xs text-[#737373]">{r.equipment.serialNumber ?? "—"}</span>
          </div>
        ) : (
          <span className="text-xs text-[#a3a3a3]">—</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={(r) => router.push(`/o/visits/${r.id}`)}
      isLoading={loading}
      sort={sort}
      onSortChange={setSort}
      emptyText={stateFilter || typeFilter ? t("noResults") : t("noVisits")}
      toolbar={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Combobox
            value={stateFilter}
            onChange={(v) => setStateFilter(v)}
            options={[
              { value: "SUGGESTED", label: t("states.SUGGESTED") },
              { value: "SCHEDULED", label: t("states.SCHEDULED") },
              { value: "IN_PROGRESS", label: t("states.IN_PROGRESS") },
              { value: "COMPLETED", label: t("states.COMPLETED") },
              { value: "FAILED_NO_SHOW", label: t("states.FAILED_NO_SHOW") },
              { value: "RESCHEDULED", label: t("states.RESCHEDULED") },
              { value: "CANCELLED", label: t("states.CANCELLED") },
            ]}
            placeholder={t("filterState")}
            searchable={false}
          />
          <Combobox
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
            options={[
              { value: "INSTALLATION", label: t("types.INSTALLATION") },
              { value: "PERIODIC_INSPECTION", label: t("types.PERIODIC_INSPECTION") },
              { value: "REPAIR", label: t("types.REPAIR") },
              { value: "FILTER_REPLACEMENT", label: t("types.FILTER_REPLACEMENT") },
              { value: "RELOCATION", label: t("types.RELOCATION") },
              { value: "PAYMENT_COLLECTION", label: t("types.PAYMENT_COLLECTION") },
              { value: "OTHER", label: t("types.OTHER") },
            ]}
            placeholder={t("filterType")}
            searchable={false}
          />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      }
      footer={
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      }
    />
  );
}

/**
 * Unassigned (SUGGESTED) tab — card list with inline recommend + 1-click
 * confirm via SchedulerWidget. Mirrors the queue column of the schedule
 * board but in a flat list form (no per-tech grouping). Office STAFF+ only.
 */
function UnassignedView() {
  const t = useTranslations("visits");
  const locale = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const url = "/api/visits?state=SUGGESTED&page=1&pageSize=200&sortBy=scheduledFor&sortDir=asc";
  const query = useApiPageQuery<VisitRow[]>(url);
  const rows = query.data?.data ?? [];

  if (query.isLoading && rows.length === 0) {
    return <p className="text-sm text-[#737373]">{t("loadingRecommend")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-[#737373]">{t("noVisits")}</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const expanded = expandedId === r.id;
        return (
          <li
            key={r.id}
            className="flex flex-col gap-2 rounded-2xl border border-[#fcd34d] bg-[#fffbeb] p-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#737373]">
                {formatDate(r.scheduledFor, locale)} ·{" "}
                {r.scheduledFor.slice(11, 16)}
                {r.scheduledWindow ? ` · ${r.scheduledWindow}` : ""}
              </span>
              <VisitTypeBadge type={r.type} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/o/visits/${r.id}`}
                className="text-sm font-semibold text-[#002A4D] hover:underline"
              >
                {r.customer.name}
                <span className="ml-1 font-mono text-[10px] text-[#737373]">
                  {r.customer.code}
                </span>
              </Link>
              <Button
                size="sm"
                variant={expanded ? "secondary" : "primary"}
                onClick={() => setExpandedId(expanded ? null : r.id)}
              >
                {expanded ? t("close") : t("assign")}
              </Button>
            </div>
            {r.equipment && (
              <p className="text-[11px] text-[#737373]">
                {pickModelName(r.equipment.model, locale)}
                {r.equipment.serialNumber ? ` · ${r.equipment.serialNumber}` : ""}
              </p>
            )}
            {expanded && (
              <div className="border-t border-[#fcd34d] pt-2">
                <UnassignedRowScheduler
                  visitId={r.id}
                  customerId={r.customer.id}
                  scheduledFor={r.scheduledFor}
                  onScheduled={() => {
                    setExpandedId(null);
                    query.refetch().catch(() => undefined);
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Thin wrapper around SchedulerWidget that wires it for SUGGESTED rows
 * where we don't carry siteId or collaboratorTechnicianIds on the row
 * payload (the list endpoint returns a slim shape).
 */
function UnassignedRowScheduler({
  visitId,
  customerId,
  scheduledFor,
  onScheduled,
}: Readonly<{
  visitId: string;
  customerId: string;
  scheduledFor: string;
  onScheduled: () => void;
}>) {
  return (
    <SchedulerWidget
      visitId={visitId}
      customerId={customerId}
      siteId={null}
      scheduledFor={scheduledFor}
      state="SUGGESTED"
      leadTechnicianId={null}
      collaboratorTechnicianIds={[]}
      onScheduled={onScheduled}
    />
  );
}
