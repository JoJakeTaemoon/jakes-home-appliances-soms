"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useApiPageQuery, useApiQuery } from "@/lib/api/hooks";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  StatusBadge,
  customerStatusTone,
  customerTypeTone,
} from "@/components/ui/status-badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { Avatar } from "@/components/ui/avatar";

interface SalesRepLite {
  id: string;
  username: string;
  title: string | null;
  avatarUrl: string | null;
}

interface CustomerRow {
  id: string;
  code: string;
  type: "B2C" | "B2B";
  status: "ACTIVE" | "INACTIVE" | "PROSPECT";
  name: string;
  shortcode: string | null;
  city: string | null;
  preferredRegion: string | null;
  contacts: Array<{
    id: string;
    name: string;
    title: string | null;
    phone1: string;
    email: string | null;
  }>;
  salesRep: SalesRepLite | null;
  activeContractCount: number;
  activeEquipmentCount: number;
  nextMaintenanceAt: string | null;
  _count?: { equipment: number; sites: number; contracts: number };
}

type CustomerRowWithIndex = CustomerRow & { __no: number };

interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  b2bCount: number;
  b2cCount: number;
  totalEquipment: number;
  totalContracts: number;
}

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000));
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (locale === "vi") {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CustomersPage() {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [type, setType] = useState<"B2C" | "B2B" | null>(null);
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "PROSPECT" | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [salesRepId, setSalesRepId] = useState<string | null>(null);
  const [contractState, setContractState] = useState<
    "ACTIVE" | "EXPIRING" | "TERMINATED" | "NONE" | null
  >(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "code",
    direction: "asc",
  });

  const onQ = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const onStatus = (v: "ACTIVE" | "INACTIVE" | "PROSPECT" | null) => {
    setStatus(v);
    setPage(1);
  };

  // Quick filters apply immediately (no [적용] step); each change resets to page 1.
  const onType = (v: "B2C" | "B2B" | null) => { setType(v); setPage(1); };
  const onContractState = (
    v: "ACTIVE" | "EXPIRING" | "TERMINATED" | "NONE" | null,
  ) => { setContractState(v); setPage(1); };
  const onRegion = (v: string | null) => { setRegion(v); setPage(1); };
  const onSalesRep = (v: string | null) => { setSalesRepId(v); setPage(1); };
  const hasFilters = !!(q || type || status || region || salesRepId || contractState);
  const resetFilters = () => {
    setQ("");
    setType(null);
    setStatus(null);
    setRegion(null);
    setSalesRepId(null);
    setContractState(null);
    setPage(1);
  };

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (debouncedQ) qs.set("q", debouncedQ);
    if (type) qs.set("type", type);
    if (status) qs.set("status", status);
    if (region) qs.set("region", region);
    if (salesRepId) qs.set("salesRepId", salesRepId);
    if (contractState) qs.set("contractState", contractState);
    if (sort) {
      qs.set("sortBy", sort.column);
      qs.set("sortDir", sort.direction);
    }
    qs.set("page", String(page));
    qs.set("pageSize", String(PAGE_SIZE));
    return `/api/customers?${qs.toString()}`;
  }, [debouncedQ, type, status, region, salesRepId, contractState, page, sort]);

  const query = useApiPageQuery<CustomerRow[]>(url);
  const rawRows = query.data?.data ?? [];
  const rows: CustomerRowWithIndex[] = rawRows.map((r, i) => ({
    ...r,
    __no: (page - 1) * PAGE_SIZE + i + 1,
  }));
  const total = (query.data?.pagination as { total?: number } | undefined)?.total ?? rows.length;
  const loading = query.isLoading;
  const error =
    query.error instanceof Error ? query.error.message : null;

  // KPI stats — separate hook, runs in parallel with the list query.
  const statsQuery = useApiQuery<CustomerStats>("/api/customers/stats");
  const stats = statsQuery.data ?? null;

  // Sales reps for the sidebar combobox.
  const repsQuery = useApiQuery<SalesRepLite[]>("/api/sales-reps");
  const reps = repsQuery.data ?? [];

  const columns = useMemo<Column<CustomerRowWithIndex>[]>(
    () => [
      {
        key: "no",
        header: "No.",
        cell: (r) => (
          <span className="font-mono text-xs text-gray-500">{r.__no}</span>
        ),
        className: "w-12",
      },
      {
        key: "code",
        header: t("code"),
        sortKey: "code",
        cell: (r) => <span className="font-mono text-xs text-gray-700">{r.code}</span>,
        className: "w-24",
      },
      {
        key: "name",
        header: t("name"),
        sortKey: "name",
        cell: (r) => (
          <div className="flex flex-col">
            <span className="font-medium text-gray-900">{r.name}</span>
            {r.shortcode && (
              <span className="text-xs text-gray-500">{r.shortcode}</span>
            )}
          </div>
        ),
      },
      {
        key: "type",
        header: t("type"),
        sortKey: "type",
        cell: (r) => <StatusBadge tone={customerTypeTone(r.type)}>{r.type}</StatusBadge>,
        className: "w-20",
      },
      {
        key: "contact",
        header: t("primaryContact"),
        cell: (r) => {
          const c = r.contacts?.[0];
          if (!c) return <span className="text-xs text-gray-400">—</span>;
          return (
            <div className="flex items-center gap-2">
              <Avatar name={c.name} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm text-gray-900">{c.name}</div>
                {c.title ? (
                  <div className="truncate text-[11px] text-gray-500">{c.title}</div>
                ) : null}
              </div>
            </div>
          );
        },
        className: "w-48",
      },
      {
        key: "contactInfo",
        header: t("contactInfo"),
        cell: (r) => {
          const c = r.contacts?.[0];
          if (!c) return <span className="text-xs text-gray-400">—</span>;
          return (
            <div className="flex flex-col text-xs">
              <span className="text-gray-700">{c.phone1}</span>
              {c.email ? (
                <span className="truncate text-gray-500">{c.email}</span>
              ) : null}
            </div>
          );
        },
        className: "w-48",
      },
      {
        key: "contractStatus",
        header: t("contractStatus"),
        cell: (r) => {
          if (r.activeContractCount === 0) {
            return (
              <StatusBadge tone="muted">{t("contractState.NONE")}</StatusBadge>
            );
          }
          return (
            <StatusBadge tone="success">{t("contractState.ACTIVE")}</StatusBadge>
          );
        },
        className: "w-32",
      },
      {
        key: "equipmentCount",
        header: t("equipmentCount"),
        cell: (r) => (
          <span className="text-sm">
            {r.activeEquipmentCount} {tc("unitCount")}
          </span>
        ),
        className: "w-20",
      },
      {
        key: "contractCount",
        header: t("contractCount"),
        cell: (r) => (
          <span className="text-sm">
            {r.activeContractCount} {tc("count")}
          </span>
        ),
        className: "w-20",
      },
      {
        key: "nextMaintenance",
        header: t("nextMaintenance"),
        cell: (r) => {
          const d = daysFromNow(r.nextMaintenanceAt);
          if (d === null) return <span className="text-xs text-gray-400">—</span>;
          return (
            <div className="flex flex-col text-xs">
              <span className="text-gray-900">{formatDate(r.nextMaintenanceAt, locale)}</span>
              <span className={d <= 7 ? "text-red-600" : d <= 30 ? "text-orange-600" : "text-gray-500"}>
                {d >= 0 ? `(${d}${tc("daysRemaining")})` : `(${-d}${tc("daysOverdue")})`}
              </span>
            </div>
          );
        },
        className: "w-32",
      },
      {
        key: "region",
        header: tc("region"),
        cell: (r) => r.city ?? <span className="text-xs text-gray-400">—</span>,
        className: "w-28",
      },
      {
        key: "preferredRegion",
        header: t("preferredRegion"),
        sortKey: "preferredRegion",
        cell: (r) =>
          r.preferredRegion ?? <span className="text-xs text-gray-400">—</span>,
        className: "w-28",
      },
      {
        key: "salesRep",
        header: t("salesRep"),
        sortKey: "salesRep",
        cell: (r) => {
          if (!r.salesRep) {
            return <span className="text-xs text-gray-400">—</span>;
          }
          return (
            <div className="flex items-center gap-2">
              <Avatar name={r.salesRep.username} imageUrl={r.salesRep.avatarUrl} size="sm" />
              <span className="text-sm text-gray-900">{r.salesRep.username}</span>
            </div>
          );
        },
        className: "w-40",
      },
      {
        key: "status",
        header: t("status"),
        sortKey: "status",
        cell: (r) => (
          <StatusBadge tone={customerStatusTone(r.status)}>{r.status}</StatusBadge>
        ),
        className: "w-28",
      },
    ],
    [t, tc, locale, page],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("listSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/o/customers/new">
            <Button>{t("newCustomer")}</Button>
          </Link>
        </div>
      </header>

      {/* KPI strip — compact (dense) so it takes ~half the height */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard dense label={t("stats.totalCustomers")} value={stats?.totalCustomers ?? "—"} />
        <KpiCard dense label={t("stats.activeCustomers")} value={stats?.activeCustomers ?? "—"} />
        <KpiCard dense label={t("stats.b2bCount")} value={stats?.b2bCount ?? "—"} />
        <KpiCard dense label={t("stats.b2cCount")} value={stats?.b2cCount ?? "—"} />
        <KpiCard dense label={t("stats.totalEquipment")} value={stats?.totalEquipment ?? "—"} />
        <KpiCard dense label={t("stats.totalContracts")} value={stats?.totalContracts ?? "—"} />
      </section>

      {/* Quick filters — horizontal bar above the table (scrolls with the page,
          not sticky). Each filter applies immediately; the table gets full width. */}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-3">
        <div className="min-w-[200px] flex-1">
          <FilterGroup label={t("searchPlaceholder")}>
            <Input value={q} onChange={(e) => onQ(e.target.value)} placeholder={t("searchPlaceholder")} />
          </FilterGroup>
        </div>
        <div className="w-36">
          <FilterGroup label={t("filterStatus")}>
            <Combobox
              value={status}
              onChange={(v) => onStatus(v as "ACTIVE" | "INACTIVE" | "PROSPECT" | null)}
              options={[
                { value: "ACTIVE", label: "ACTIVE" },
                { value: "INACTIVE", label: "INACTIVE" },
                { value: "PROSPECT", label: "PROSPECT" },
              ]}
              placeholder={t("all")}
              searchable={false}
            />
          </FilterGroup>
        </div>
        <div className="w-40">
          <FilterGroup label={t("contractStatus")}>
            <Combobox
              value={contractState}
              onChange={(v) => onContractState(v as typeof contractState)}
              options={[
                { value: "ACTIVE", label: t("contractState.ACTIVE") },
                { value: "EXPIRING", label: t("contractState.EXPIRING") },
                { value: "TERMINATED", label: t("contractState.TERMINATED") },
                { value: "NONE", label: t("contractState.NONE") },
              ]}
              placeholder={t("all")}
              searchable={false}
            />
          </FilterGroup>
        </div>
        <div className="w-28">
          <FilterGroup label={t("type")}>
            <Combobox
              value={type}
              onChange={(v) => onType(v as "B2C" | "B2B" | null)}
              options={[
                { value: "B2C", label: "B2C" },
                { value: "B2B", label: "B2B" },
              ]}
              placeholder={t("all")}
              searchable={false}
            />
          </FilterGroup>
        </div>
        <div className="w-40">
          <FilterGroup label={t("preferredRegion")}>
            <Input value={region ?? ""} onChange={(e) => onRegion(e.target.value || null)} placeholder={t("regionPlaceholder")} />
          </FilterGroup>
        </div>
        <div className="w-44">
          <FilterGroup label={t("salesRep")}>
            <Combobox
              value={salesRepId}
              onChange={(v) => onSalesRep(v as string | null)}
              options={reps.map((r) => ({ value: r.id, label: r.username }))}
              placeholder={t("all")}
              searchable
            />
          </FilterGroup>
        </div>
        {hasFilters && (
          <Button variant="ghost" onClick={resetFilters}>{t("reset")}</Button>
        )}
      </div>

      <DataTable<CustomerRowWithIndex>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={loading}
        sort={sort}
        onSortChange={setSort}
        emptyText={hasFilters ? t("noResults") : t("noCustomers")}
        onRowClick={(r) => router.push(`/o/customers/${r.id}`)}
        footer={
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
