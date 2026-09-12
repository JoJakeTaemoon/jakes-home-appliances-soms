"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useApiPageQuery } from "@/lib/api/hooks";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { formatDateOrDash as formatDate, formatDateTimeOrDash as formatDateTime } from "@/lib/format";

type ViewMode = "batch" | "visit";

interface BatchRow {
  id: string;
  at: string;
  actorUser: { id: string; username: string } | null;
  after: {
    customerId?: string;
    modelId?: string;
    count?: number;
    equipmentIds?: string[];
    serviceType?: string;
  } | null;
}

interface VisitRow {
  id: string;
  scheduledFor: string;
  state: string;
  customer: { id: string; code: string; name: string } | null;
  equipment: {
    id: string;
    serialNumber: string | null;
    model: { nameKo: string | null; nameVi: string | null; nameEn: string | null } | null;
  } | null;
  leadTechnician: { id: string; username: string } | null;
}

const PAGE_SIZE = 30;

export default function InstallationHistoryPage() {
  const t = useTranslations("equipment.installationHistory");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [mode, setMode] = useState<ViewMode>("batch");
  const [page, setPage] = useState(1);

  const url = `/api/equipment/installation-history?groupBy=${mode}&page=${page}&pageSize=${PAGE_SIZE}`;

  const batchQuery = useApiPageQuery<BatchRow[]>(mode === "batch" ? url : null);
  const visitQuery = useApiPageQuery<VisitRow[]>(mode === "visit" ? url : null);
  const data = mode === "batch" ? batchQuery.data : visitQuery.data;
  const total = (data?.pagination as { total?: number } | undefined)?.total ?? 0;

  const batchColumns: Column<BatchRow>[] = [
    {
      key: "at",
      header: t("columns.batch.registeredAt"),
      cell: (r) => <span className="text-sm text-gray-900">{formatDateTime(r.at, locale)}</span>,
    },
    {
      key: "actor",
      header: t("columns.batch.registeredBy"),
      cell: (r) => r.actorUser?.username ?? "—",
    },
    {
      key: "count",
      header: t("columns.batch.quantity"),
      cell: (r) => <span className="font-semibold">{r.after?.count ?? "—"}</span>,
    },
    {
      key: "service",
      header: t("columns.batch.serviceType"),
      cell: (r) => r.after?.serviceType ?? "—",
    },
  ];

  const visitColumns: Column<VisitRow>[] = [
    {
      key: "scheduledFor",
      header: t("columns.visit.scheduledAt"),
      cell: (r) => formatDate(r.scheduledFor, locale),
    },
    {
      key: "customer",
      header: t("columns.visit.customer"),
      cell: (r) => r.customer?.name ?? "—",
    },
    {
      key: "model",
      header: t("columns.visit.model"),
      cell: (r) =>
        r.equipment?.model
          ? r.equipment.model.nameKo ?? r.equipment.model.nameEn ?? r.equipment.model.nameVi ?? "—"
          : "—",
    },
    {
      key: "serial",
      header: t("columns.visit.equipmentCode"),
      cell: (r) => <span className="font-mono text-xs">{r.equipment?.serialNumber ?? "—"}</span>,
    },
    {
      key: "tech",
      header: t("columns.visit.technician"),
      cell: (r) => r.leadTechnician?.username ?? "—",
    },
    {
      key: "state",
      header: t("columns.visit.state"),
      cell: (r) => (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">{r.state}</span>
      ),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 rounded-md border-2 border-gray-200 bg-white p-1 text-xs">
          {(["batch", "visit"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setPage(1);
              }}
              className={`rounded px-3 py-1.5 ${mode === m ? "bg-blue-600 text-white" : "text-gray-700"}`}
            >
              {t(`viewMode.${m}`)}
            </button>
          ))}
        </div>
      </header>

      {mode === "batch" ? (
        <DataTable<BatchRow>
          columns={batchColumns}
          rows={(batchQuery.data?.data as BatchRow[] | undefined) ?? []}
          rowKey={(r) => r.id}
          isLoading={batchQuery.isLoading}
          emptyText={tc("noData")}
          footer={
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          }
        />
      ) : (
        <DataTable<VisitRow>
          columns={visitColumns}
          rows={(visitQuery.data?.data as VisitRow[] | undefined) ?? []}
          rowKey={(r) => r.id}
          isLoading={visitQuery.isLoading}
          emptyText={tc("noData")}
          footer={
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          }
        />
      )}
    </div>
  );
}


