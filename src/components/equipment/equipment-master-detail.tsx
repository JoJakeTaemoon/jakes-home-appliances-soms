"use client";

/**
 * Single-screen master-detail for a customer's equipment (WS-4). Left = the
 * customer's equipment list (search + optional site filter + table); right =
 * the selected unit's detail panel (5 tabs). Bottom = desktop-ERP function
 * bar. The selected unit lives in the URL (`?tab=equipment&equipmentId=…`)
 * so it survives back/forward and deep links, matching the tab-sync pattern
 * the customer page already uses.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApiQuery } from "@/lib/api/hooks";
import { canManageEquipment } from "@/lib/customers/access";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { ActionBar, type ActionBarItem } from "@/components/ui/action-bar";
import { StatusBadge, equipmentStatusTone } from "@/components/ui/status-badge";
import { EquipmentDetailPanel } from "@/components/equipment/equipment-detail-panel";
import {
  EquipmentEditModal,
  type EquipmentEditValues,
} from "@/components/equipment/equipment-edit-modal";
import { formatDate } from "@/lib/format";

interface EquipmentRow {
  id: string;
  model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  siteId: string | null;
  site: { id: string; name: string } | null;
  serialNumber: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
}

export function EquipmentMasterDetail({
  customerId,
  customerType,
  equipment,
  sites,
  role,
  onChanged,
}: Readonly<{
  customerId: string;
  customerType: "B2C" | "B2B";
  equipment: EquipmentRow[];
  sites: { id: string; name: string }[];
  role: string;
  onChanged: () => void | Promise<void>;
}>) {
  const t = useTranslations("equipment");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canManage = canManageEquipment(role);

  const selectedId = searchParams.get("equipmentId");
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  // Keep ?tab=equipment when writing ?equipmentId so back/forward + the
  // customer-page tab sync stay consistent.
  const select = (id: string | null) => {
    const qs = new URLSearchParams();
    qs.set("tab", "equipment");
    if (id) qs.set("equipmentId", id);
    // ponytail: scroll:false keeps viewport put — selecting a row must not jump to top
    router.replace(`${pathname}?${qs.toString()}` as "/o", { scroll: false });
  };

  // Guard: a selectedId that isn't in THIS customer's list (deep-linked to a
  // deleted unit or another customer's id) would otherwise render foreign data
  // or an infinite "loading". Deselect it once the list is known.
  useEffect(() => {
    if (selectedId && equipment.length > 0 && !equipment.some((e) => e.id === selectedId)) {
      select(null);
    }
    // select is stable enough for this guard; re-run only on id/list change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, equipment]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipment.filter((e) => {
      if (siteFilter && e.siteId !== siteFilter) return false;
      if (!q) return true;
      const hay = [
        e.serialNumber,
        e.model.modelCode,
        pickModelName(e.model, locale),
        e.site?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [equipment, siteFilter, search, locale]);

  // Selected unit's full detail for the edit modal (shared cache with panel).
  const editQuery = useApiQuery<EquipmentEditValues>(
    showEdit && selectedId ? `/api/equipment/${selectedId}` : null,
  );
  const editData = editQuery.data ?? null;

  const actionItems: ActionBarItem[] = [
    // Register + edit are management actions — gated on canManage (parity with
    // the old inline "장비 추가" link which was permission-gated).
    ...(canManage
      ? ([
          {
            key: "register",
            label: t("masterDetail.register"),
            variant: "primary",
            hotkey: "F2",
            onClick: () =>
              router.push(`/o/equipment/register?customerId=${customerId}` as "/o"),
          },
          {
            key: "edit",
            label: t("masterDetail.edit"),
            hotkey: "F5",
            disabled: !selectedId,
            onClick: () => setShowEdit(true),
          },
        ] satisfies ActionBarItem[])
      : []),
    {
      key: "detail",
      label: t("masterDetail.detail"),
      disabled: !selectedId,
      onClick: () => selectedId && router.push(`/o/equipment/${selectedId}` as "/o"),
    },
    {
      key: "close",
      label: t("masterDetail.close"),
      variant: "ghost",
      disabled: !selectedId,
      onClick: () => select(null),
    },
  ];

  const isB2B = customerType === "B2B";

  return (
    <div className="flex flex-col gap-3">
      {/* Search + site filter (full width) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
        </div>
        {isB2B && sites.length > 0 && (
          <div className="w-48 shrink-0">
            <Combobox
              value={siteFilter}
              onChange={setSiteFilter}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("site")}
              searchable={sites.length > 5}
            />
          </div>
        )}
      </div>

      {/* Full-width list; the selected row expands its detail inline below it. */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center text-sm text-[#737373]">
          {t("noEquipment")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-[#525252]">
              <tr>
                <th className="w-8 px-2 py-1.5" />
                <th className="px-2 py-1.5 text-left text-xs uppercase">#</th>
                <th className="px-2 py-1.5 text-left text-xs uppercase">{t("model")}</th>
                <th className="px-2 py-1.5 text-left text-xs uppercase">{t("serial")}</th>
                {isB2B && <th className="px-2 py-1.5 text-left text-xs uppercase">{t("site")}</th>}
                <th className="px-2 py-1.5 text-left text-xs uppercase">{t("installDate")}</th>
                <th className="px-2 py-1.5 text-left text-xs uppercase">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const active = e.id === selectedId;
                return (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() => select(active ? null : e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          select(active ? null : e.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={active}
                      aria-label={pickModelName(e.model, locale)}
                      className={`cursor-pointer border-b border-[#f5f5f5] focus:outline-none ${
                        active ? "bg-[var(--brand-blue-50)]" : "hover:bg-[#fafafa] focus:bg-[#f0f7ff]"
                      }`}
                    >
                      <td className="px-2 py-1.5 text-center text-[#737373]">
                        <span aria-hidden className={`inline-block transition-transform ${active ? "rotate-90" : ""}`}>▸</span>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-[#737373]">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-medium">{pickModelName(e.model, locale)}</span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs">{e.serialNumber ?? "—"}</td>
                      {isB2B && <td className="px-2 py-1.5">{e.site?.name ?? "—"}</td>}
                      <td className="px-2 py-1.5 text-xs">{formatDate(e.installedAt, locale)}</td>
                      <td className="px-2 py-1.5">
                        <StatusBadge tone={equipmentStatusTone(e.status)}>{e.status}</StatusBadge>
                      </td>
                    </tr>
                    {active && (
                      <tr className="bg-[#fafafa]">
                        <td colSpan={isB2B ? 7 : 6} className="border-b border-[#e5e5e5] p-0">
                          <div className="animate-expand-row">
                            <div className="overflow-hidden">
                              <div className="p-3">
                                <EquipmentDetailPanel
                                  equipmentId={e.id}
                                  canManage={canManage}
                                  onEdit={canManage ? () => setShowEdit(true) : undefined}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ③ Function bar */}
      <ActionBar items={actionItems} className="rounded-xl border border-[#e5e5e5]" />

      {editData && (
        <EquipmentEditModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          equipment={{
            id: editData.id,
            modelId: editData.modelId ?? null,
            siteId: editData.siteId,
            serialNumber: editData.serialNumber,
            assetCode: editData.assetCode,
            ownership: editData.ownership,
            installedAt: editData.installedAt,
            serviceType: editData.serviceType,
            managementType: editData.managementType,
            deposit: editData.deposit,
            monthlyFee: editData.monthlyFee,
            salePrice: editData.salePrice,
            installFee: editData.installFee,
            customInspectionCycleDays: editData.customInspectionCycleDays,
            customMaintenanceCycleDays: editData.customMaintenanceCycleDays,
            lastInspectionAtOverride: editData.lastInspectionAtOverride,
            notes: editData.notes,
            customDescription: editData.customDescription,
          }}
          customerType={customerType}
          sites={sites}
          locale={locale as "ko" | "vi" | "en"}
          onSaved={async () => {
            setShowEdit(false);
            await editQuery.refetch();
            await onChanged();
          }}
        />
      )}
    </div>
  );
}
