"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ContractStateBadge,
  ContractTypeBadge,
} from "@/components/contracts/contract-state-badge";
import { formatDate, formatVnd } from "@/lib/format";

interface ContractRow {
  id: string;
  contractNumber: string;
  type: "SALE" | "RENTAL" | "MAINTENANCE";
  state: string;
  startDate: string | null;
  endDate: string | null;
  monthlyMaintenanceFee: string | null;
  totalContractValue: string | null;
  amendmentRevision: number;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  _count?: { equipment: number; amendments: number };
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

export default function ContractsPage() {
  const t = useTranslations("contracts");
  const router = useRouter();
  const locale = useLocale();
  const api = useApi();

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [typeFilter, setTypeFilter] = useState<"SALE" | "RENTAL" | "MAINTENANCE" | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [endingBefore, setEndingBefore] = useState("");

  const [rows, setRows] = useState<ContractRow[]>([]);
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
      if (typeFilter) sp.set("type", typeFilter);
      if (stateFilter) sp.set("state", stateFilter);
      if (endingBefore) sp.set("endingBefore", new Date(endingBefore).toISOString());

      const res = await api.get<ContractRow[]>(`/api/contracts?${sp.toString()}`);
      setRows(res.data);
      const pag = (res as { pagination?: { total: number } }).pagination;
      setTotal(pag?.total ?? res.data.length);
    } finally {
      setLoading(false);
    }
  }, [api, page, debouncedQ, typeFilter, stateFilter, endingBefore]);

  useEffect(() => {
    void load();
  }, [load]);

  // Compute renewal-due threshold (60 days from today).
  const renewalThreshold = new Date();
  renewalThreshold.setDate(renewalThreshold.getDate() + 60);

  const columns: Column<ContractRow>[] = [
    {
      key: "contractNumber",
      header: t("contractNumber"),
      cell: (row) => (
        <Link href={`/contracts/${row.id}`} className="font-mono text-xs text-[var(--brand-blue-700)] underline">
          {row.contractNumber}
        </Link>
      ),
    },
    {
      key: "customer",
      header: t("customer"),
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.customer.name}</span>
          <span className="font-mono text-xs text-[#737373]">{row.customer.code}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: t("type"),
      cell: (row) => <ContractTypeBadge type={row.type} />,
    },
    {
      key: "state",
      header: t("state"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <ContractStateBadge state={row.state} />
          {row.amendmentRevision > 0 && (
            <span className="font-mono text-[10px] text-[#737373]">A{row.amendmentRevision}</span>
          )}
        </div>
      ),
    },
    {
      key: "startDate",
      header: t("startDate"),
      cell: (row) => formatDate(row.startDate, locale) || "—",
    },
    {
      key: "endDate",
      header: t("endDate"),
      cell: (row) => {
        const formatted = formatDate(row.endDate, locale) || "—";
        if (row.type !== "RENTAL" || !row.endDate || row.state !== "ACTIVE") {
          return formatted;
        }
        const end = new Date(row.endDate);
        const isSoon = end < renewalThreshold;
        return (
          <div className="flex items-center gap-2">
            <span>{formatted}</span>
            {isSoon && <StatusBadge tone="warning">{t("renewalDueSoon")}</StatusBadge>}
          </div>
        );
      },
    },
    {
      key: "monthlyFee",
      header: t("monthlyFee"),
      cell: (row) => formatVnd(row.monthlyMaintenanceFee) || "—",
      align: "right",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <Link href="/contracts/new">
          <Button>{t("newContract")}</Button>
        </Link>
      </header>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/contracts/${r.id}`)}
        isLoading={loading}
        emptyText={debouncedQ || typeFilter || stateFilter ? t("noResults") : t("noContracts")}
        toolbar={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Input
                placeholder={t("searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Combobox
              value={typeFilter}
              onChange={(v) => setTypeFilter((v as "SALE" | "RENTAL" | "MAINTENANCE" | null) ?? null)}
              options={[
                { value: "SALE", label: t("types.SALE") },
                { value: "RENTAL", label: t("types.RENTAL") },
                { value: "MAINTENANCE", label: t("types.MAINTENANCE") },
              ]}
              placeholder={t("filterType")}
              searchable={false}
            />
            <Combobox
              value={stateFilter}
              onChange={(v) => setStateFilter(v)}
              options={[
                { value: "DRAFT", label: t("states.DRAFT") },
                { value: "PENDING_SIGNATURE", label: t("states.PENDING_SIGNATURE") },
                { value: "ACTIVE", label: t("states.ACTIVE") },
                { value: "AMENDED", label: t("states.AMENDED") },
                { value: "COMPLETED", label: t("states.COMPLETED") },
                { value: "TERMINATED", label: t("states.TERMINATED") },
                { value: "CANCELLED", label: t("states.CANCELLED") },
              ]}
              placeholder={t("filterState")}
              searchable={false}
            />
            <Input
              type="date"
              value={endingBefore}
              onChange={(e) => setEndingBefore(e.target.value)}
              placeholder={t("endingBefore")}
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
