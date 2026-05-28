"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatVnd } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { canManageEquipmentModel } from "@/lib/customers/access";

interface ModelRow {
  id: string;
  modelCode: string;
  name: string;
  category: "WATER_PURIFIER" | "BIDET" | "AIR_PURIFIER" | "FILTER" | "OTHER";
  retailPrice: string | null;
  monthlyRentalPrice: string | null;
  monthlyMaintenancePrice: string | null;
  isActive: boolean;
}

const PAGE_SIZE = 50;

export default function EquipmentModelsPage() {
  const t = useTranslations("equipmentModels");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        qs.set("page", String(page));
        qs.set("pageSize", String(PAGE_SIZE));
        const res = await api.get<ModelRow[]>(`/api/equipment-models?${qs.toString()}`);
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
  }, [api, q, page]);

  const columns = useMemo<Column<ModelRow>[]>(
    () => [
      { key: "code", header: t("modelCode"), cell: (r) => <span className="font-mono text-xs">{r.modelCode}</span> },
      { key: "name", header: t("name"), cell: (r) => r.name },
      {
        key: "category",
        header: t("category"),
        cell: (r) => <StatusBadge tone="info">{t(`categoryValues.${r.category}`)}</StatusBadge>,
      },
      { key: "retail", header: t("retailPrice"), cell: (r) => formatVnd(r.retailPrice), align: "right" },
      {
        key: "rental",
        header: t("monthlyRentalPrice"),
        cell: (r) => formatVnd(r.monthlyRentalPrice),
        align: "right",
      },
      {
        key: "active",
        header: t("isActive"),
        cell: (r) => (
          <StatusBadge tone={r.isActive ? "success" : "muted"}>
            {r.isActive ? "ACTIVE" : "INACTIVE"}
          </StatusBadge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-[#737373]">{total}</p>
        </div>
        {canManageEquipmentModel(role) && (
          <Link href="/equipment-models/new">
            <Button>{t("newModel")}</Button>
          </Link>
        )}
      </header>

      <DataTable<ModelRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={loading}
        emptyText={q ? tc("noResults") : t("noModels")}
        onRowClick={(r) =>
          canManageEquipmentModel(role) ? router.push(`/equipment-models/${r.id}/edit`) : undefined
        }
        toolbar={
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tc("searchPlaceholder")}
          />
        }
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}
      />
    </div>
  );
}
