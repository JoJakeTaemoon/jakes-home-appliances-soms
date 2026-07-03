"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { StatusBadge } from "@/components/ui/status-badge";
import { ServiceConfigTable } from "./service-config-table";

interface Props {
  equipmentId: string;
  /** Whether the consumer is the embedded master-detail panel or the full
   *  /equipment/[id] page. Drives a minor heading size choice. */
  embedded?: boolean;
}

interface EquipmentDetail {
  id: string;
  serialNumber: string | null;
  assetCode: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
  registeredAt: string | null;
  serviceType: string | null;
  managementType: string | null;
  lifecycleStage: string;
  deposit: string | number | null;
  monthlyFee: string | number | null;
  customInspectionCycle: number | null;
  imageUrl: string | null;
  notes: string | null;
  customDescription: string | null;
  customer: { id: string; code: string; name: string } | null;
  site: { id: string; name: string } | null;
  model: {
    modelCode: string | null;
    nameKo: string | null;
    nameVi: string | null;
    nameEn: string | null;
    inspectionEveryMonths: number | null;
    imageUrl?: string | null;
  } | null;
  registeredBy: { id: string; username: string } | null;
  installedByTechnician: { id: string; username: string } | null;
  contracts: Array<{
    contract: {
      id: string;
      contractNumber: string;
      type: string;
      state: string;
      startDate: string | null;
      endDate: string | null;
    };
  }>;
}

interface VisitLite {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  completedAt: string | null;
  leadTechnician: { username: string } | null;
}

interface OrderLite {
  id: string;
  orderNumber: string;
  orderedAt: string;
  items: Array<{ customName: string | null; quantity: number; totalPrice: string }>;
}

export function EquipmentDetailContent({ equipmentId, embedded = false }: Readonly<Props>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const locale = useLocale();

  const detailQuery = useApiQuery<EquipmentDetail>(
    `/api/equipment/${equipmentId}`,
  );
  const detail = detailQuery.data ?? null;

  if (!detail) {
    return (
      <div className="rounded-lg border-2 border-gray-200 bg-white p-6 text-sm text-gray-500">
        {tc("loading")}
      </div>
    );
  }

  const modelName =
    locale === "ko"
      ? (detail.model?.nameKo ?? detail.customDescription ?? "—")
      : locale === "en"
        ? (detail.model?.nameEn ?? detail.customDescription ?? "—")
        : (detail.model?.nameVi ?? detail.customDescription ?? "—");

  const HeadingTag = embedded ? "h3" : "h2";

  return (
    <div className="flex flex-col gap-4">
      {/* Equipment detail card + service config side-by-side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border-2 border-gray-200 bg-white p-4">
          <HeadingTag className="mb-3 text-sm font-semibold text-gray-700">
            {t("detail.title")}
          </HeadingTag>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <div className="flex h-32 w-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
                {detail.imageUrl || detail.model?.imageUrl ? (
                  <img
                    src={detail.imageUrl ?? detail.model?.imageUrl ?? ""}
                    alt={modelName}
                    className="h-full w-full rounded-md object-contain"
                  />
                ) : (
                  <span>No image</span>
                )}
              </div>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-2 text-xs">
              <Field label={t("detail.model")} value={modelName} />
              <Field label={t("detail.serial")} value={detail.serialNumber ?? "—"} />
              <Field label={t("detail.assetCode")} value={detail.assetCode ?? "—"} />
              <Field label={t("detail.location")} value={detail.site?.name ?? "—"} />
              <Field
                label={t("detail.serviceType")}
                value={detail.serviceType ? <StatusBadge tone="info">{detail.serviceType}</StatusBadge> : "—"}
              />
              <Field
                label={t("detail.managementType")}
                value={detail.managementType ? <StatusBadge tone="muted">{detail.managementType}</StatusBadge> : "—"}
              />
              <Field
                label={t("detail.deposit")}
                value={detail.deposit ? formatMoney(Number(detail.deposit)) : "—"}
              />
              <Field
                label={t("detail.monthlyFee")}
                value={detail.monthlyFee ? formatMoney(Number(detail.monthlyFee)) : "—"}
              />
              <Field
                label={t("detail.installedAt")}
                value={formatDate(detail.installedAt, locale)}
              />
              <Field
                label={t("detail.registeredBy")}
                value={detail.registeredBy?.username ?? "—"}
              />
              <Field
                label={t("detail.technician")}
                value={detail.installedByTechnician?.username ?? "—"}
              />
              <Field
                label={t("detail.inspectionCycle")}
                value={
                  (detail.customInspectionCycle ?? detail.model?.inspectionEveryMonths ?? null) !== null
                    ? `${detail.customInspectionCycle ?? detail.model?.inspectionEveryMonths} ${t("detail.months")}`
                    : "—"
                }
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border-2 border-gray-200 bg-white p-4">
          <HeadingTag className="mb-3 text-sm font-semibold text-gray-700">
            {t("serviceConfig.title")}
          </HeadingTag>
          <ServiceConfigTable equipmentId={equipmentId} />
        </section>
      </div>

      {/* Widgets row: purchase / recent visit / next schedule / customer request */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PurchaseHistoryWidget equipmentId={equipmentId} />
        <RecentWorkWidget equipmentId={equipmentId} />
        <NextScheduleWidget equipmentId={equipmentId} />
        <CustomerRequestWidget equipmentId={equipmentId} />
      </div>
    </div>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}

function PurchaseHistoryWidget({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const locale = useLocale();
  const q = useApiQuery<OrderLite[]>(`/api/equipment/${equipmentId}/orders`);
  const orders = q.data ?? [];
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-700">
        {t("widgets.purchaseHistory")}
      </h4>
      {orders.length === 0 ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <ul className="space-y-1.5">
          {orders.slice(0, 5).map((o) => (
            <li key={o.id} className="flex justify-between text-xs">
              <span className="text-gray-700">{formatDate(o.orderedAt, locale)}</span>
              <span className="font-mono text-gray-500">{o.orderNumber}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentWorkWidget({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const locale = useLocale();
  const q = useApiQuery<VisitLite[]>(
    `/api/visits?equipmentId=${equipmentId}&pageSize=5`,
  );
  const visits = q.data ?? [];
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-700">
        {t("widgets.recentWork")}
      </h4>
      {visits.length === 0 ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <ul className="space-y-1.5">
          {visits.slice(0, 5).map((v) => (
            <li key={v.id} className="flex justify-between text-xs">
              <span className="text-gray-700">
                {formatDate(v.completedAt ?? v.scheduledFor, locale)}
              </span>
              <span className="text-gray-500">{v.type}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NextScheduleWidget({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const locale = useLocale();
  const q = useApiQuery<VisitLite[]>(
    `/api/visits?equipmentId=${equipmentId}&state=SUGGESTED,SCHEDULED&pageSize=1`,
  );
  const next = q.data?.[0] ?? null;
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-700">
        {t("widgets.nextSchedule")}
      </h4>
      {!next ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <div className="text-xs">
          <div className="font-medium text-gray-900">
            {formatDate(next.scheduledFor, locale)}
          </div>
          <div className="mt-0.5 text-gray-500">{next.type}</div>
        </div>
      )}
    </section>
  );
}

function CustomerRequestWidget({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  void equipmentId;
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-700">
        {t("widgets.customerRequest")}
      </h4>
      <p className="text-xs text-gray-400">—</p>
    </section>
  );
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}

function formatDate(iso: string | null | undefined | Date, locale: string): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  if (locale === "vi") {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
