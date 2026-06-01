"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { canManageEquipment } from "@/lib/customers/access";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  StatusBadge,
  equipmentOwnershipTone,
  equipmentStatusTone,
} from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { useLocale } from "next-intl";

interface EquipmentRow {
  id: string;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  site: { id: string; name: string; region: string | null } | null;
  model: { id: string; modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  serialNumber: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
}

const PAGE_SIZE = 25;

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export default function EquipmentPage() {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const api = useApi();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "createdAt",
    direction: "desc",
  });

  useEffect(() => {
    setPage(1);
  }, [dq, status]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (dq) qs.set("q", dq);
        if (status) qs.set("status", status);
        if (sort) {
          qs.set("sortBy", sort.column);
          qs.set("sortDir", sort.direction);
        }
        qs.set("page", String(page));
        qs.set("pageSize", String(PAGE_SIZE));
        const res = await api.get<EquipmentRow[]>(`/api/equipment?${qs.toString()}`);
        if (cancelled) return;
        setRows(res.data);
        setTotal((res as unknown as { pagination?: { total: number } }).pagination?.total ?? res.data.length);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [api, dq, status, page, sort]);

  const columns = useMemo<Column<EquipmentRow>[]>(
    () => [
      {
        key: "customer",
        header: t("customer"),
        sortKey: "customer",
        cell: (r) => (
          <div className="flex flex-col">
            <span className="font-mono text-xs text-[#737373]">{r.customer.code}</span>
            <span className="font-medium">{r.customer.name}</span>
          </div>
        ),
      },
      {
        key: "site",
        header: t("site"),
        sortKey: "site",
        cell: (r) => r.site?.name ?? <span className="text-xs text-[#a3a3a3]">—</span>,
      },
      {
        key: "model",
        header: t("model"),
        sortKey: "model",
        cell: (r) => (
          <div className="flex flex-col">
            <span className="font-mono text-xs">{pickModelName(r.model, locale)}</span>
            <span className="text-xs text-[#737373]">{pickModelName(r.model, locale)}</span>
          </div>
        ),
      },
      {
        key: "serial",
        header: t("serial"),
        sortKey: "serialNumber",
        cell: (r) => <span className="font-mono text-xs">{r.serialNumber ?? "—"}</span>,
      },
      {
        key: "installed",
        header: t("installDate"),
        sortKey: "installedAt",
        cell: (r) => formatDate(r.installedAt, locale),
      },
      {
        key: "status",
        header: t("status"),
        sortKey: "status",
        cell: (r) => <StatusBadge tone={equipmentStatusTone(r.status)}>{r.status}</StatusBadge>,
      },
      {
        key: "ownership",
        header: t("ownership"),
        sortKey: "ownership",
        cell: (r) => (
          <StatusBadge tone={equipmentOwnershipTone(r.ownership)}>{r.ownership}</StatusBadge>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-[#737373]">{total}</p>
        </div>
        {canManageEquipment(role) && (
          <Link href="/equipment/new">
            <Button>{t("installNew")}</Button>
          </Link>
        )}
      </header>

      <DataTable<EquipmentRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={loading}
        sort={sort}
        onSortChange={setSort}
        emptyText={dq || status ? tc("noResults") : t("noEquipment")}
        onRowClick={(r) => router.push(`/equipment/${r.id}`)}
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} />
            </div>
            <div className="w-full sm:w-56">
              <Combobox
                value={status}
                onChange={setStatus}
                options={(["ACTIVE", "REPLACED", "RELOCATED", "DEACTIVATED", "TERMINATED"] as const).map((s) => ({
                  value: s,
                  label: t(`statusValues.${s}`),
                }))}
                placeholder={t("filterStatus")}
                searchable={false}
              />
            </div>
          </div>
        }
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}
      />
    </div>
  );
}
