"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { pickEquipmentLabel } from "@/lib/products/name";
import { useApiPageQuery } from "@/lib/api/hooks";
import { useAuth } from "@/providers/auth-provider";
import { canManageEquipment } from "@/lib/customers/access";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
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
  model: { id: string; modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null } | null;
  customDescription: string | null;
  serialNumber: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
}

const PAGE_SIZE = 25;
const STATUSES = ["ACTIVE", "REPLACED", "RELOCATED", "DEACTIVATED", "TERMINATED"] as const;

/** A shared link's value, or nothing if it is not one we would have written. */
const fromUrl = (v: string | null, ok: (v: string) => boolean) => (v && ok(v) ? v : "");
const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export default function EquipmentPage() {
  // useSearchParams() needs a Suspense boundary for static prerender.
  return (
    <Suspense fallback={null}>
      <EquipmentList />
    </Suspense>
  );
}

function EquipmentList() {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const pathname = usePathname();
  // Filters live in the URL (?q=&status=&installedFrom=&installedTo=) so a
  // filtered list can be shared as a link.
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const dq = useDebounced(q, 300);
  const [status, setStatus] = useState<string | null>(
    () => fromUrl(searchParams.get("status"), (v) => (STATUSES as readonly string[]).includes(v)) || null,
  );
  const [installedFrom, setInstalledFrom] = useState(() => fromUrl(searchParams.get("installedFrom"), isYmd));
  const [installedTo, setInstalledTo] = useState(() => fromUrl(searchParams.get("installedTo"), isYmd));
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "createdAt",
    direction: "desc",
  });

  const onQ = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const onStatus = (v: string | null) => {
    setStatus(v);
    setPage(1);
  };
  const onInstalledFrom = (v: string) => {
    setInstalledFrom(v);
    setPage(1);
  };
  const onInstalledTo = (v: string) => {
    setInstalledTo(v);
    setPage(1);
  };

  const filterQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (dq) qs.set("q", dq);
    if (status) qs.set("status", status);
    if (installedFrom) qs.set("installedFrom", installedFrom);
    if (installedTo) qs.set("installedTo", installedTo);
    return qs.toString();
  }, [dq, status, installedFrom, installedTo]);

  useEffect(() => {
    if (filterQs === searchParams.toString()) return;
    router.replace((filterQs ? `${pathname}?${filterQs}` : pathname) as "/o", { scroll: false });
  }, [filterQs, pathname, router, searchParams]);

  const url = useMemo(() => {
    const qs = new URLSearchParams(filterQs);
    if (sort) {
      qs.set("sortBy", sort.column);
      qs.set("sortDir", sort.direction);
    }
    qs.set("page", String(page));
    qs.set("pageSize", String(PAGE_SIZE));
    return `/api/equipment?${qs.toString()}`;
  }, [filterQs, page, sort]);

  const query = useApiPageQuery<EquipmentRow[]>(url);
  const rows = query.data?.data ?? [];
  const total =
    (query.data?.pagination as { total?: number } | undefined)?.total ??
    rows.length;
  const loading = query.isLoading;

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
            <span className="font-mono text-xs">{pickEquipmentLabel(r, locale)}</span>
            <span className="text-xs text-[#737373]">
              {r.model?.modelCode ?? (r.customDescription ? "External" : "—")}
            </span>
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
    <div className="flex w-full flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-[#737373]">{total}</p>
        </div>
        {canManageEquipment(role) && (
          <Link href="/o/equipment/register">
            <Button>{t("register.title")}</Button>
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
        emptyText={filterQs ? tc("noResults") : t("noEquipment")}
        onRowClick={(r) => router.push(`/o/equipment/${r.id}`)}
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input value={q} onChange={(e) => onQ(e.target.value)} placeholder={t("searchPlaceholder")} />
            </div>
            <div className="w-full sm:w-56">
              <Combobox
                value={status}
                onChange={onStatus}
                options={STATUSES.map((s) => ({
                  value: s,
                  label: t(`statusValues.${s}`),
                }))}
                placeholder={t("filterStatus")}
                searchable={false}
              />
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <DatePicker
                value={installedFrom}
                onChange={onInstalledFrom}
                max={installedTo || undefined}
                placeholder={t("filterInstalledFrom")}
                ariaLabel={t("filterInstalledFrom")}
                className="w-full sm:w-40"
              />
              <span className="text-[#737373]">~</span>
              <DatePicker
                value={installedTo}
                onChange={onInstalledTo}
                min={installedFrom || undefined}
                placeholder={t("filterInstalledTo")}
                ariaLabel={t("filterInstalledTo")}
                className="w-full sm:w-40"
              />
            </div>
          </div>
        }
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}
      />
    </div>
  );
}
