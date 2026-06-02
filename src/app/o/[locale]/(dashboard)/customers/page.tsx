"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useApiPageQuery } from "@/lib/api/hooks";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  StatusBadge,
  customerStatusTone,
  customerTypeTone,
} from "@/components/ui/status-badge";

interface CustomerRow {
  id: string;
  code: string;
  type: "B2C" | "B2B";
  status: "ACTIVE" | "INACTIVE" | "PROSPECT";
  name: string;
  shortcode: string | null;
  city: string | null;
  preferredRegion: string | null;
  contacts: Array<{ id: string; name: string; phone1: string }>;
  _count?: { equipment: number; sites: number; contracts: number };
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

export default function CustomersPage() {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const router = useRouter();

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [type, setType] = useState<"B2C" | "B2B" | null>(null);
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "PROSPECT" | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "code",
    direction: "asc",
  });

  // Reset to page 1 when any filter changes. Folded into the filter
  // setters via wrapper handlers so we don't need a useEffect that
  // setStates from another setState (set-state-in-effect rule).
  const onQ = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const onType = (v: "B2C" | "B2B" | null) => {
    setType(v);
    setPage(1);
  };
  const onStatus = (v: "ACTIVE" | "INACTIVE" | "PROSPECT" | null) => {
    setStatus(v);
    setPage(1);
  };

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (debouncedQ) qs.set("q", debouncedQ);
    if (type) qs.set("type", type);
    if (status) qs.set("status", status);
    if (sort) {
      qs.set("sortBy", sort.column);
      qs.set("sortDir", sort.direction);
    }
    qs.set("page", String(page));
    qs.set("pageSize", String(PAGE_SIZE));
    return `/api/customers?${qs.toString()}`;
  }, [debouncedQ, type, status, page, sort]);

  const query = useApiPageQuery<CustomerRow[]>(url);
  const rows = query.data?.data ?? [];
  const total = (query.data?.pagination as { total?: number } | undefined)?.total ?? rows.length;
  const loading = query.isLoading;
  const error =
    query.error instanceof Error ? query.error.message : null;

  const columns = useMemo<Column<CustomerRow>[]>(
    () => [
      {
        key: "code",
        header: t("code"),
        sortKey: "code",
        cell: (r) => <span className="font-mono text-xs text-[#525252]">{r.code}</span>,
        className: "w-28",
      },
      {
        key: "type",
        header: t("type"),
        sortKey: "type",
        cell: (r) => <StatusBadge tone={customerTypeTone(r.type)}>{r.type}</StatusBadge>,
        className: "w-20",
      },
      {
        key: "name",
        header: t("name"),
        sortKey: "name",
        cell: (r) => (
          <div className="flex flex-col">
            <span className="font-medium text-[#111111]">{r.name}</span>
            {r.shortcode && (
              <span className="text-xs text-[#737373]">{r.shortcode}</span>
            )}
          </div>
        ),
      },
      {
        key: "contact",
        header: t("primaryContact"),
        cell: (r) => {
          const c = r.contacts?.[0];
          if (!c) return <span className="text-xs text-[#a3a3a3]">—</span>;
          return (
            <div className="flex flex-col">
              <span>{c.name}</span>
              <span className="text-xs text-[#737373]">{c.phone1}</span>
            </div>
          );
        },
      },
      {
        key: "city",
        header: tc("city"),
        cell: (r) => r.city ?? <span className="text-xs text-[#a3a3a3]">—</span>,
        className: "w-40",
      },
      {
        key: "region",
        header: t("preferredRegion"),
        sortKey: "preferredRegion",
        cell: (r) =>
          r.preferredRegion ?? <span className="text-xs text-[#a3a3a3]">—</span>,
        className: "w-32",
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
    [t, tc],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-[#737373]">{total} {tc("name").toLowerCase()}</p>
        </div>
        <Link href="/o/customers/new">
          <Button>{t("newCustomer")}</Button>
        </Link>
      </header>

      <DataTable<CustomerRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={loading}
        sort={sort}
        onSortChange={setSort}
        emptyText={debouncedQ || type || status ? t("noResults") : t("noCustomers")}
        onRowClick={(r) => router.push(`/o/customers/${r.id}`)}
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                value={q}
                onChange={(e) => onQ(e.target.value)}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            <div className="w-full sm:w-44">
              <Combobox
                value={type}
                onChange={(v) => onType(v as "B2C" | "B2B" | null)}
                options={[
                  { value: "B2C", label: "B2C" },
                  { value: "B2B", label: "B2B" },
                ]}
                placeholder={t("filterType")}
                searchable={false}
              />
            </div>
            <div className="w-full sm:w-44">
              <Combobox
                value={status}
                onChange={(v) =>
                  onStatus(v as "ACTIVE" | "INACTIVE" | "PROSPECT" | null)
                }
                options={[
                  { value: "ACTIVE", label: "ACTIVE" },
                  { value: "INACTIVE", label: "INACTIVE" },
                  { value: "PROSPECT", label: "PROSPECT" },
                ]}
                placeholder={t("filterStatus")}
                searchable={false}
              />
            </div>
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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
