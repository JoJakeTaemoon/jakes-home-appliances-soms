"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  VisitStateBadge,
  VisitTypeBadge,
} from "@/components/visits/visit-state-badge";
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
    model: { modelCode: string; name: string };
  } | null;
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

export default function VisitsListPage() {
  const t = useTranslations("visits");
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [rows, setRows] = useState<VisitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("page", String(page));
      sp.set("pageSize", String(PAGE_SIZE));
      if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
      if (stateFilter) sp.set("state", stateFilter);
      if (typeFilter) sp.set("type", typeFilter);
      if (from) sp.set("from", new Date(from).toISOString());
      if (to) sp.set("to", new Date(to).toISOString());
      const res = await api.get<VisitRow[]>(`/api/visits?${sp.toString()}`);
      setRows(res.data);
      const pag = (res as { pagination?: { total: number } }).pagination;
      setTotal(pag?.total ?? res.data.length);
    } finally {
      setLoading(false);
    }
  }, [api, page, debouncedQ, stateFilter, typeFilter, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<VisitRow>[] = [
    {
      key: "scheduledFor",
      header: t("scheduledFor"),
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
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.customer.name}</span>
          <span className="font-mono text-xs text-[#737373]">{r.customer.code}</span>
        </div>
      ),
    },
    { key: "type", header: t("type"), cell: (r) => <VisitTypeBadge type={r.type} /> },
    { key: "state", header: t("state"), cell: (r) => <VisitStateBadge state={r.state} /> },
    {
      key: "tech",
      header: t("lead"),
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
            <span className="font-mono text-xs">{r.equipment.model.modelCode}</span>
            <span className="text-xs text-[#737373]">{r.equipment.serialNumber ?? "—"}</span>
          </div>
        ) : (
          <span className="text-xs text-[#a3a3a3]">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <Link href="/visits/new">
          <Button>{t("newVisit")}</Button>
        </Link>
      </header>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/visits/${r.id}`)}
        isLoading={loading}
        emptyText={debouncedQ || stateFilter || typeFilter ? t("noResults") : t("noVisits")}
        toolbar={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <Input
              placeholder={t("searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
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
    </div>
  );
}
