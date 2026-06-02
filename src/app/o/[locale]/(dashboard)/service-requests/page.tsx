"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApiPageQuery } from "@/lib/api/hooks";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  SrStateBadge,
  SrTypeBadge,
} from "@/components/service-requests/sr-state-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { MessageSquareDot } from "lucide-react";

interface SrRow {
  id: string;
  code: string;
  type: string;
  state: string;
  isPaid: boolean;
  submittedAt: string;
  hasUnreadCustomerMessage: boolean;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  equipment: {
    id: string;
    serialNumber: string | null;
    model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  } | null;
  visit: { id: string; state: string; scheduledFor: string } | null;
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

export default function ServiceRequestsListPage() {
  const t = useTranslations("serviceRequests");
  const locale = useLocale();
  const router = useRouter();

  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [paidFilter, setPaidFilter] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  // Reset to page 1 whenever a filter changes so the query doesn't
  // request page=3 of a freshly filtered result set.
  const onQ = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const onTab = (v: "pending" | "all") => {
    setTab(v);
    setPage(1);
  };
  const onStateFilter = (v: string | null) => {
    setStateFilter(v);
    setPage(1);
  };
  const onTypeFilter = (v: string | null) => {
    setTypeFilter(v);
    setPage(1);
  };
  const onPaidFilter = (v: string | null) => {
    setPaidFilter(v);
    setPage(1);
  };
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "submittedAt",
    direction: "desc",
  });

  const url = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("pageSize", String(PAGE_SIZE));
    if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
    if (tab === "pending") {
      sp.set("state", "PENDING_REVIEW");
    } else if (stateFilter) {
      sp.set("state", stateFilter);
    }
    if (typeFilter) sp.set("type", typeFilter);
    if (paidFilter) sp.set("isPaid", paidFilter);
    if (sort) {
      sp.set("sortBy", sort.column);
      sp.set("sortDir", sort.direction);
    }
    return `/api/service-requests?${sp.toString()}`;
  }, [page, debouncedQ, tab, stateFilter, typeFilter, paidFilter, sort]);

  const query = useApiPageQuery<SrRow[]>(url);
  const rows = query.data?.data ?? [];
  const total =
    (query.data?.pagination as { total?: number } | undefined)?.total ??
    rows.length;
  const loading = query.isLoading;

  const columns: Column<SrRow>[] = [
    {
      key: "code",
      header: t("code"),
      sortKey: "code",
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {r.hasUnreadCustomerMessage && (
            <MessageSquareDot
              className="size-4 shrink-0 text-[#dc2626]"
              strokeWidth={2}
              aria-label={t("unreadMessage")}
            />
          )}
          <span className="font-mono text-xs text-[#262626]">{r.code}</span>
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
    { key: "type", header: t("type"), sortKey: "type", cell: (r) => <SrTypeBadge type={r.type} /> },
    { key: "state", header: t("state"), sortKey: "state", cell: (r) => <SrStateBadge state={r.state} /> },
    {
      key: "isPaid",
      header: t("isPaid"),
      sortKey: "isPaid",
      cell: (r) => (
        <StatusBadge tone={r.isPaid ? "warning" : "success"}>
          {r.isPaid ? t("isPaidYes") : t("isPaidNo")}
        </StatusBadge>
      ),
    },
    {
      key: "equipment",
      header: t("filterCustomer"),
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
    {
      key: "submittedAt",
      header: t("submittedAt"),
      sortKey: "submittedAt",
      cell: (r) => (
        <span className="text-sm text-[#262626]">
          {formatDate(r.submittedAt, locale)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <Link href="/o/service-requests/new">
          <Button>{t("newRequest")}</Button>
        </Link>
      </header>

      <div className="flex gap-1 border-b border-[#e5e5e5]">
        {(["pending", "all"] as const).map((k) => {
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onTab(k)}
              className={[
                "px-4 py-2 text-sm font-medium outline-none transition-colors",
                active
                  ? "border-b-2 border-[var(--brand-blue-500)] text-[var(--brand-blue-700)]"
                  : "text-[#525252] hover:text-[#262626]",
              ].join(" ")}
            >
              {k === "pending" ? t("tabPending") : t("tabAll")}
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/o/service-requests/${r.id}`)}
        isLoading={loading}
        sort={sort}
        onSortChange={setSort}
        emptyText={
          debouncedQ || stateFilter || typeFilter || paidFilter
            ? t("noResults")
            : t("noRequests")
        }
        toolbar={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input
              placeholder={t("searchPlaceholder")}
              value={q}
              onChange={(e) => onQ(e.target.value)}
            />
            {tab === "all" && (
              <Combobox
                value={stateFilter}
                onChange={onStateFilter}
                options={[
                  { value: "PENDING_REVIEW", label: t("states.PENDING_REVIEW") },
                  { value: "APPROVED", label: t("states.APPROVED") },
                  { value: "REJECTED", label: t("states.REJECTED") },
                  { value: "SCHEDULED", label: t("states.SCHEDULED") },
                  { value: "COMPLETED", label: t("states.COMPLETED") },
                  { value: "CANCELLED", label: t("states.CANCELLED") },
                ]}
                placeholder={t("filterState")}
                searchable={false}
              />
            )}
            <Combobox
              value={typeFilter}
              onChange={onTypeFilter}
              options={[
                { value: "INSPECTION", label: t("types.INSPECTION") },
                { value: "REPAIR", label: t("types.REPAIR") },
                { value: "PART_REPLACEMENT", label: t("types.PART_REPLACEMENT") },
                { value: "RELOCATION", label: t("types.RELOCATION") },
                { value: "OTHER", label: t("types.OTHER") },
              ]}
              placeholder={t("filterType")}
              searchable={false}
            />
            <Combobox
              value={paidFilter}
              onChange={onPaidFilter}
              options={[
                { value: "true", label: t("filterPaidPaid") },
                { value: "false", label: t("filterPaidFree") },
              ]}
              placeholder={t("filterPaid")}
              searchable={false}
            />
          </div>
        }
        footer={
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
      />
    </div>
  );
}
