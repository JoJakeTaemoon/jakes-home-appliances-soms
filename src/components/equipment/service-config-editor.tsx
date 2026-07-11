"use client";

/**
 * Step 4 of the 4-step bulk-register wizard — 정기점검 주기 + 필터(소모품)
 * 편집 테이블. Loads the model's default consumables catalog and lets the
 * operator tweak per-line 사용주기/수량 or add custom filter rows before
 * submit. Money is not involved here (see `ServiceMethodSection` for the
 * contract/pricing fields).
 */

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { useApiQuery } from "@/lib/api/hooks";
import { addDays } from "@/lib/equipment/cycle";

export type ServiceConfigFilter = {
  consumableId?: string;
  customName?: string;
  name: string;
  baseCycleDays: number | null;
  useCycleDays: number;
  quantity: number;
};

export type ServiceConfigValue = {
  inspectionCycleDays: number | null;
  filters: ServiceConfigFilter[];
};

interface ConsumableLite {
  consumableId: string;
  sku: string | null;
  name: { ko: string | null; vi: string | null; en: string | null };
  replaceEveryDays: number | null;
  cleanEveryDays: number | null;
  cleanOnEveryVisit: boolean;
  defaultQuantity: number;
  retailPrice: number;
}

interface Props {
  modelId: string | null;
  installDate: string;
  inspectionDisabled: boolean;
  value: ServiceConfigValue;
  onChange: (v: ServiceConfigValue) => void;
}

const DEFAULT_INSPECTION_CYCLE_DAYS = 30;
const DEFAULT_USE_CYCLE_DAYS = 30;

export function ServiceConfigEditor({
  modelId,
  installDate,
  inspectionDisabled,
  value,
  onChange,
}: Readonly<Props>) {
  const t = useTranslations("equipment.serviceConfigEditor");
  const locale = useLocale();

  const consumablesQuery = useApiQuery<ConsumableLite[]>(
    modelId ? `/api/equipment-models/${modelId}/consumables` : null,
  );

  // ponytail: value-derived guard (remount-safe) — the wizard mounts this
  // step conditionally, so a component-local ref would reset on remount and
  // re-seed over the user's edits. `value.filters` lives in the parent and
  // survives remounts, so "nothing seeded yet" is exactly `filters.length
  // === 0`. NOTE for Task 2a.6 (wizard integration): the parent must reset
  // `value.filters` to `[]` when modelId changes so this effect re-seeds
  // from the new model's catalog.
  useEffect(() => {
    if (!modelId || !consumablesQuery.data) return;
    if (value.filters.length > 0) return;
    const filters: ServiceConfigFilter[] = consumablesQuery.data.map((c) => ({
      consumableId: c.consumableId,
      name: pickName(c.name, locale),
      baseCycleDays: c.replaceEveryDays,
      useCycleDays: c.replaceEveryDays ?? DEFAULT_USE_CYCLE_DAYS,
      quantity: c.defaultQuantity,
    }));
    onChange({ ...value, filters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, consumablesQuery.data, value.filters.length]);

  function patchFilter(index: number, patch: Partial<ServiceConfigFilter>) {
    const filters = value.filters.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange({ ...value, filters });
  }

  function removeFilter(index: number) {
    onChange({ ...value, filters: value.filters.filter((_, i) => i !== index) });
  }

  function addFilter() {
    onChange({
      ...value,
      filters: [
        ...value.filters,
        {
          customName: "",
          name: "",
          baseCycleDays: null,
          useCycleDays: DEFAULT_USE_CYCLE_DAYS,
          quantity: 1,
        },
      ],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[#525252]">
          {t("inspectionCycle")}
        </label>
        <NumberInput
          ariaLabel={t("inspectionCycle")}
          value={value.inspectionCycleDays ?? DEFAULT_INSPECTION_CYCLE_DAYS}
          onChange={(v) => onChange({ ...value, inspectionCycleDays: v })}
          disabled={inspectionDisabled}
          min={1}
          max={3600}
        />
        {inspectionDisabled && (
          <p className="mt-1 text-xs text-[#737373]">{t("inspectionDisabledHint")}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border-4 border-[var(--brand-blue-100)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--brand-blue-100)] bg-[var(--brand-blue-50)] text-left text-[#525252]">
              <th className="px-3 py-2">{t("filterKind")}</th>
              <th className="px-3 py-2">{t("productName")}</th>
              <th className="px-3 py-2">{t("baseCycle")}</th>
              <th className="px-3 py-2">{t("useCycle")}</th>
              <th className="px-3 py-2">{t("quantity")}</th>
              <th className="px-3 py-2">{t("lastReplacedAt")}</th>
              <th className="px-3 py-2">{t("nextDueAt")}</th>
              <th className="px-3 py-2">{t("actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {value.filters.map((f, i) => (
              <tr key={f.consumableId ?? `custom-${i}`}>
                <td className="px-3 py-2 text-[#525252]">{t("filterKindLabel")}</td>
                <td className="px-3 py-2 font-medium text-[#111111]">
                  {f.consumableId ? (
                    f.name
                  ) : (
                    <Input
                      aria-label={t("productName")}
                      value={f.customName ?? ""}
                      onChange={(e) =>
                        patchFilter(i, { customName: e.target.value, name: e.target.value })
                      }
                    />
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-[#737373]">
                  {f.baseCycleDays !== null ? `${f.baseCycleDays}${t("daysUnit")}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <NumberInput
                    ariaLabel={t("useCycle")}
                    value={f.useCycleDays}
                    onChange={(v) => patchFilter(i, { useCycleDays: v })}
                    min={1}
                    max={3600}
                  />
                </td>
                <td className="px-3 py-2">
                  <NumberInput
                    ariaLabel={t("quantity")}
                    value={f.quantity}
                    onChange={(v) => patchFilter(i, { quantity: v })}
                    min={1}
                    max={99}
                  />
                </td>
                <td className="px-3 py-2 tabular-nums text-[#737373]">
                  {formatDate(installDate, locale)}
                </td>
                <td className="px-3 py-2 tabular-nums text-[#111111]">
                  {formatDate(addDays(installDate, f.useCycleDays), locale)}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-label={t("removeFilter")}
                    onClick={() => removeFilter(i)}
                    className="text-red-600 hover:underline"
                  >
                    {t("removeFilter")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addFilter}
        className="self-start rounded-lg border-2 border-[var(--brand-blue-200)] px-3 py-1.5 text-xs font-medium text-[var(--brand-blue-700)] hover:bg-[var(--brand-blue-50)]"
      >
        {t("addFilter")}
      </button>
    </div>
  );
}

// Mirrors service-config-table.tsx's formatDate — VI = DD/MM/YYYY, KO/EN = ISO.
function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (locale === "vi") {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pickName(
  name: { ko: string | null; vi: string | null; en: string | null },
  locale: string,
): string {
  if (locale === "ko") return name.ko || name.vi || name.en || "—";
  if (locale === "en") return name.en || name.vi || name.ko || "—";
  return name.vi || name.ko || name.en || "—";
}
