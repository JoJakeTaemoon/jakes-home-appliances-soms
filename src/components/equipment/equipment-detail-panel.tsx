"use client";

/**
 * Right-hand detail panel for the customer equipment master-detail view
 * (WS-4). Self-fetches `/api/equipment/[id]` and renders the same blocks
 * the dedicated /o/equipment/[id] page uses (ServiceConfigTable, the
 * per-equipment widgets, the shared list blocks) inside a 5-tab layout,
 * matching the client's desktop-ERP mockup.
 *
 * Edit + hard status transitions stay on the dedicated page / the parent's
 * edit modal — this panel is read-first with an "edit" hook and a link out
 * to the full page for relocate/replace/terminate.
 */

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApiQuery } from "@/lib/api/hooks";
import { Tabs, TabsList, Tab, TabPanel } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  equipmentOwnershipTone,
  equipmentStatusTone,
} from "@/components/ui/status-badge";
import { ServiceConfigTable } from "@/components/equipment/service-config-table";
import {
  PurchaseHistoryWidget,
  RecentWorkWidget,
  NextScheduleWidget,
} from "@/components/equipment/equipment-widgets";
import {
  EquipmentContractsList,
  EquipmentFilterHistory,
  EquipmentPaymentsList,
} from "@/components/equipment/equipment-lists";
import { formatDate, formatVnd } from "@/lib/format";

interface EquipmentDetail {
  id: string;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  site: { id: string; name: string } | null;
  model: {
    modelCode: string | null;
    nameKo: string | null;
    nameVi: string | null;
    nameEn: string | null;
    category: string;
    filterPolicy: { filters?: { type: string; replaceEveryDays: number }[] } | null;
  };
  serialNumber: string | null;
  assetCode: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
  serviceType: string | null;
  managementType: string | null;
  monthlyFee: string | null;
  salePrice: string | null;
  deactivatedAt: string | null;
  terminatedAt: string | null;
  retrievedAt: string | null;
  filterPolicyOverride: { filters?: { type: string; replaceEveryDays: number }[] } | null;
  notes: string | null;
}

export function EquipmentDetailPanel({
  equipmentId,
  canManage,
  onEdit,
}: Readonly<{
  equipmentId: string;
  canManage: boolean;
  onEdit?: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const locale = useLocale();

  const query = useApiQuery<EquipmentDetail>(`/api/equipment/${equipmentId}`);
  const data = query.data ?? null;

  if (!data) {
    return (
      <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 text-sm text-[#737373]">
        {tc("loading")}
      </div>
    );
  }

  const policy = data.filterPolicyOverride ?? data.model.filterPolicy;

  return (
    <div className="flex flex-col gap-4 rounded-xl border-2 border-gray-200 bg-white p-4">
      {/* Panel header — model + status + link out to the full page */}
      <header className="flex flex-col gap-2 border-b border-[#eee] pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={equipmentStatusTone(data.status)}>{data.status}</StatusBadge>
            <StatusBadge tone={equipmentOwnershipTone(data.ownership)}>{data.ownership}</StatusBadge>
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold text-[#002A4D]">
            {pickModelName(data.model, locale)}
          </h2>
          <p className="text-xs text-[#737373]">
            {data.serialNumber ?? data.model.modelCode ?? "—"}
            {data.site && <> · {data.site.name}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && onEdit && (
            <Button size="sm" onClick={onEdit}>{t("actions.edit")}</Button>
          )}
          <Link href={`/o/equipment/${data.id}`}>
            <Button variant="secondary" size="sm">{t("openFullPage")}</Button>
          </Link>
        </div>
      </header>

      <Tabs defaultValue="basic">
        <TabsList>
          <Tab value="basic">{t("panel.tabBasic")}</Tab>
          <Tab value="filter">{t("panel.tabFilter")}</Tab>
          <Tab value="service">{t("panel.tabService")}</Tab>
          <Tab value="payments">{t("panel.tabPayments")}</Tab>
          <Tab value="notes">{t("panel.tabNotes")}</Tab>
        </TabsList>

        {/* 기본정보 */}
        <TabPanel value="basic">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Row label={t("serial")} value={data.serialNumber ?? "—"} mono />
              <Row label={t("detail.assetCode")} value={data.assetCode ?? "—"} mono />
              <Row label={t("model")} value={pickModelName(data.model, locale)} />
              <Row
                label={t("category")}
                value={
                  data.model.category
                    ? t(`categoryValues.${data.model.category}` as never)
                    : "—"
                }
              />
              <Row label={t("installDate")} value={formatDate(data.installedAt, locale)} />
              <Row label={t("ownership")} value={data.ownership} />
              {data.deactivatedAt && (
                <Row label={t("deactivatedAt")} value={formatDate(data.deactivatedAt, locale)} />
              )}
              {data.terminatedAt && (
                <Row label={t("terminatedAt")} value={formatDate(data.terminatedAt, locale)} />
              )}
            </div>

            {/* 서비스 구성 (점검 + 필터) */}
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#737373]">
                {t("serviceConfig.title")}
              </h3>
              <ServiceConfigTable equipmentId={data.id} />
            </section>

            {/* 주요정보 + 다음 일정 */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="rounded-lg border border-[#e5e5e5] p-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#737373]">
                  {t("panel.keyInfo")}
                </h3>
                <Row
                  label={t("filterPolicy")}
                  value={
                    data.filterPolicyOverride
                      ? t("filterPolicyOverride")
                      : t("filterPolicyDefault")
                  }
                />
                <Row label={t("detail.serviceType")} value={data.serviceType ?? "—"} />
                <Row label={t("detail.managementType")} value={data.managementType ?? "—"} />
                <Row label={t("edit.salePrice")} value={data.salePrice ? formatVnd(data.salePrice) : "—"} />
                <Row label={t("detail.monthlyFee")} value={data.monthlyFee ? formatVnd(data.monthlyFee) : "—"} />
              </section>
              <NextScheduleWidget equipmentId={data.id} />
            </div>
          </div>
        </TabPanel>

        {/* 필터정보 */}
        <TabPanel value="filter">
          <div className="flex flex-col gap-4">
            <section className="rounded-lg border border-[#e5e5e5] p-3">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#737373]">
                {t("filterPolicy")}
              </h3>
              {data.filterPolicyOverride ? (
                <StatusBadge tone="warning">{t("filterPolicyOverride")}</StatusBadge>
              ) : (
                <StatusBadge tone="muted">{t("filterPolicyDefault")}</StatusBadge>
              )}
              {policy?.filters && policy.filters.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {policy.filters.map((f) => (
                    <li key={f.type} className="flex items-center justify-between">
                      <span>{f.type}</span>
                      <span className="text-xs text-[#737373]">{f.replaceEveryDays}d</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[#737373]">—</p>
              )}
            </section>
            <EquipmentFilterHistory equipmentId={data.id} canManage={canManage} />
          </div>
        </TabPanel>

        {/* 서비스이력 */}
        <TabPanel value="service">
          <div className="flex flex-col gap-4">
            <RecentWorkWidget equipmentId={data.id} />
            <PurchaseHistoryWidget equipmentId={data.id} />
            <EquipmentContractsList equipmentId={data.id} />
          </div>
        </TabPanel>

        {/* 수금내역 */}
        <TabPanel value="payments">
          <EquipmentPaymentsList equipmentId={data.id} />
        </TabPanel>

        {/* 메모 */}
        <TabPanel value="notes">
          <div className="rounded-lg border border-[#e5e5e5] p-4">
            <p className="whitespace-pre-wrap text-sm text-[#525252]">
              {data.notes ?? t("panel.noNotes")}
            </p>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}

function Row({ label, value, mono }: Readonly<{ label: string; value: React.ReactNode; mono?: boolean }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-xs text-[#737373]">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-[#111111]"}>{value}</span>
    </div>
  );
}
