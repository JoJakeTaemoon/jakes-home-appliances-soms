"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApiPageQuery } from "@/lib/api/hooks";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatVnd } from "@/lib/format";

interface PaymentRow {
  id: string;
  state: string;
  method: string;
  expectedAmount: string;
  actualAmount: string;
  carryoverAmount: string;
  dueDate: string | null;
  collectedAt: string | null;
  reconciledAt: string | null;
  daysOverdue: number;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  contract: { id: string; contractNumber: string; type: string } | null;
  visit: { id: string; type: string; scheduledFor: string } | null;
  collectedBy: { id: string; username: string } | null;
  taxInvoice: { id: string; invoiceNumber: string | null } | null;
}

const PAGE_SIZE = 25;

const STATE_OPTIONS = [
  "EXPECTED",
  "COLLECTED",
  "HANDED_OVER",
  "RECONCILED",
  "OVERDUE_D7",
  "OVERDUE_D14",
  "OVERDUE_D30",
  "WRITTEN_OFF",
];
const METHOD_OPTIONS = ["CASH", "BANK_TRANSFER"];

function stateTone(state: string): "success" | "warning" | "danger" | "info" | "muted" | "neutral" {
  if (state === "RECONCILED") return "success";
  if (state === "WRITTEN_OFF") return "muted";
  if (state === "COLLECTED" || state === "HANDED_OVER") return "info";
  if (state.startsWith("OVERDUE_")) return "danger";
  return "neutral";
}

export default function PaymentsListPage() {
  const t = useTranslations("payments");
  const tStates = useTranslations("payments.states");
  const tMethods = useTranslations("payments.methods");
  const locale = useLocale();
  const router = useRouter();

  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [pendingHandover, setPendingHandover] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "dueDate",
    direction: "asc",
  });

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (stateFilter) params.set("state", stateFilter);
    if (methodFilter) params.set("method", methodFilter);
    if (overdueOnly) params.set("overdueOnly", "true");
    if (pendingHandover) params.set("pendingHandover", "true");
    if (sort) {
      params.set("sortBy", sort.column);
      params.set("sortDir", sort.direction);
    }
    return `/api/payments?${params.toString()}`;
  }, [page, stateFilter, methodFilter, overdueOnly, pendingHandover, sort]);

  const query = useApiPageQuery<PaymentRow[]>(url);
  const rows = query.data?.data ?? [];
  const total =
    (query.data?.pagination as { total?: number } | undefined)?.total ?? 0;
  const loading = query.isLoading;

  const columns: Column<PaymentRow>[] = [
    {
      key: "customer",
      header: t("tableCustomer"),
      sortKey: "customer",
      cell: (r) => (
        <div>
          <div className="font-medium text-[#111]">{r.customer.name}</div>
          <div className="text-xs text-[#737373]">{r.customer.code}</div>
        </div>
      ),
    },
    {
      key: "contract",
      header: t("tableContract"),
      cell: (r) => r.contract?.contractNumber ?? "—",
    },
    {
      key: "method",
      header: t("tableMethod"),
      sortKey: "method",
      cell: (r) => tMethods(r.method as "CASH"),
    },
    {
      key: "expected",
      header: t("tableExpected"),
      sortKey: "expectedAmount",
      align: "right",
      cell: (r) => formatVnd(r.expectedAmount),
    },
    {
      key: "actual",
      header: t("tableActual"),
      sortKey: "actualAmount",
      align: "right",
      cell: (r) => formatVnd(r.actualAmount),
    },
    {
      key: "state",
      header: t("tableState"),
      sortKey: "state",
      cell: (r) => (
        <StatusBadge tone={stateTone(r.state)}>
          {tStates(r.state as "EXPECTED")}
        </StatusBadge>
      ),
    },
    {
      key: "due",
      header: t("tableDueDate"),
      sortKey: "dueDate",
      cell: (r) => (r.dueDate ? formatDate(r.dueDate, locale) : "—"),
    },
    {
      key: "overdue",
      header: t("tableOverdue"),
      align: "right",
      cell: (r) =>
        r.daysOverdue > 0 ? (
          <span className="font-semibold text-red-600">{r.daysOverdue}</span>
        ) : (
          "—"
        ),
    },
  ];

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.customer.name.toLowerCase().includes(s) ||
      r.customer.code.toLowerCase().includes(s) ||
      r.contract?.contractNumber?.toLowerCase().includes(s) ||
      false
    );
  });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="max-w-xs"
        />
        <Combobox
          value={stateFilter}
          onChange={(v) => {
            setStateFilter(v);
            setPage(1);
          }}
          options={STATE_OPTIONS.map((s) => ({
            value: s,
            label: tStates(s as "EXPECTED"),
          }))}
          placeholder={t("filterState")}
          allowClear
        />
        <Combobox
          value={methodFilter}
          onChange={(v) => {
            setMethodFilter(v);
            setPage(1);
          }}
          options={METHOD_OPTIONS.map((m) => ({
            value: m,
            label: tMethods(m as "CASH"),
          }))}
          placeholder={t("filterMethod")}
          allowClear
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setPage(1);
            }}
          />
          {t("filterOverdue")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pendingHandover}
            onChange={(e) => {
              setPendingHandover(e.target.checked);
              setPage(1);
            }}
          />
          {t("filterPendingHandover")}
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        isLoading={loading}
        sort={sort}
        onSortChange={setSort}
        emptyText={t("noPayments")}
        onRowClick={(r) => router.push(`/o/payments/${r.id}`)}
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
