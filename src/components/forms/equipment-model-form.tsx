"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";

/** One row in the model's filter config (요청 A) — which filter, how many, and
 *  an optional per-model cycle override (empty = use the filter's own cycle).
 *  `uid` is a stable React key so add/remove/reorder don't reuse a sibling's
 *  Combobox internal state. */
interface ModelFilterRow {
  uid: string;
  consumableId: string;
  quantity: string;
  cycleOverride: string; // empty → inherit the filter's replaceEveryDays
}

let rowCounter = 0;
function newRowUid() {
  rowCounter += 1;
  return `f${rowCounter}`;
}

type CategoryValue = "WATER_PURIFIER" | "BIDET" | "AIR_PURIFIER" | "FILTER" | "OTHER";

interface ModelInput {
  nameKo: string;
  nameVi: string;
  nameEn: string;
  brandId: string | null;
  category: CategoryValue | null;
  description: string;
  retailPrice: string;
  monthlyRentalPrice: string;
  monthlyMaintenancePrice: string;
  inspectionEveryDays: string;
  warrantyMonths: string;
  isActive: boolean;
}

interface Props {
  initial?: Partial<ModelInput> & { id?: string };
  mode: "create" | "edit";
  /** When provided, replaces the default `finish()` on save/cancel. */
  onDone?: () => void;
}

interface BrandOpt {
  id: string;
  name: string;
}

interface ConsumableOpt {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  replaceEveryDays: number | null;
}

const EMPTY: ModelInput = {
  nameKo: "",
  nameVi: "",
  nameEn: "",
  brandId: null,
  category: null,
  description: "",
  retailPrice: "",
  monthlyRentalPrice: "",
  monthlyMaintenancePrice: "",
  inspectionEveryDays: "",
  warrantyMonths: "12",
  isActive: true,
};

export function EquipmentModelForm({ initial, mode, onDone }: Readonly<Props>) {
  const t = useTranslations("equipmentModels");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();
  const finish = () => {
    if (onDone) onDone();
    else router.push("/admin/products");
  };
  const [data, setData] = useState<ModelInput>({ ...EMPTY, ...initial });
  const [filters, setFilters] = useState<ModelFilterRow[]>([]);
  // Edit mode loads the existing filter config asynchronously. Until it
  // resolves we must NOT submit `compatibleConsumables` — an empty list would
  // wipe the model's existing filters. Create mode is ready immediately.
  const [filtersReady, setFiltersReady] = useState(mode !== "edit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [consumables, setConsumables] = useState<ConsumableOpt[]>([]);

  // Load brands + the filter catalog (for the filter picker).
  useEffect(() => {
    void (async () => {
      try {
        const [b, c] = await Promise.all([
          api.get<BrandOpt[]>("/api/admin/products/brands?pageSize=100&isActive=true"),
          api.get<ConsumableOpt[]>("/api/admin/products/consumables?pageSize=500&isActive=true"),
        ]);
        setBrands(b.data ?? []);
        setConsumables(c.data ?? []);
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 403) return;
        console.warn("[equipment-model-form] catalog load failed", e);
      }
    })();
  }, [api]);

  // Edit mode: prefill the filter config from the model's ConsumableOnModel rows.
  useEffect(() => {
    if (mode !== "edit" || !initial?.id) return;
    void (async () => {
      try {
        const res = await api.get<{
          consumables?: Array<{
            consumableId: string;
            quantity: number;
            replaceEveryDaysOverride: number | null;
          }>;
        }>(`/api/equipment-models/${initial.id}`);
        setFilters(
          (res.data?.consumables ?? []).map((r) => ({
            uid: newRowUid(),
            consumableId: r.consumableId,
            quantity: String(r.quantity),
            cycleOverride: r.replaceEveryDaysOverride == null ? "" : String(r.replaceEveryDaysOverride),
          })),
        );
        setFiltersReady(true);
      } catch (e) {
        // Surface the failure and leave `filtersReady` false so Save stays
        // disabled — never submit an empty filter list that would silently
        // wipe the model's existing config.
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [api, mode, initial?.id]);

  function setField<K extends keyof ModelInput>(key: K, value: ModelInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function consumableLabel(c: ConsumableOpt): string {
    const name = c.nameKo || c.nameVi || c.nameEn || c.sku;
    return `${name} (${c.sku})`;
  }
  const consumableById = useMemo(() => new Map(consumables.map((c) => [c.id, c])), [consumables]);
  const consumableOptions = useMemo(
    () => consumables.map((c) => ({ value: c.id, label: consumableLabel(c) })),
    [consumables],
  );

  function updateFilter(idx: number, patch: Partial<ModelFilterRow>) {
    setFilters((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const compatibleConsumables = filters
        .filter((f) => f.consumableId)
        .map((f, i) => ({
          consumableId: f.consumableId,
          quantity: f.quantity ? Number(f.quantity) : 1,
          sortOrder: i,
          replaceEveryDaysOverride: f.cycleOverride ? Number(f.cycleOverride) : null,
        }));
      const payload = {
        nameKo: data.nameKo || undefined,
        nameVi: data.nameVi || undefined,
        nameEn: data.nameEn || undefined,
        brandId: data.brandId,
        category: data.category ?? null,
        description: data.description || undefined,
        retailPrice: data.retailPrice ? Number(data.retailPrice) : null,
        monthlyRentalPrice: data.monthlyRentalPrice ? Number(data.monthlyRentalPrice) : null,
        monthlyMaintenancePrice: data.monthlyMaintenancePrice ? Number(data.monthlyMaintenancePrice) : null,
        inspectionEveryDays: data.inspectionEveryDays ? Number(data.inspectionEveryDays) : null,
        warrantyMonths: data.warrantyMonths ? Number(data.warrantyMonths) : null,
        // Omit when the edit-mode prefill hasn't resolved — sending [] here
        // would wipe the model's existing filters (PATCH replaces wholesale).
        ...(filtersReady ? { compatibleConsumables } : {}),
        isActive: data.isActive,
      };
      if (mode === "create") {
        await api.post("/api/equipment-models", payload);
      } else {
        await api.patch(`/api/equipment-models/${initial?.id}`, payload);
      }
      finish();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">
          {mode === "create" ? t("newModel") : t("title")}
        </h1>
        <Button variant="ghost" onClick={() => finish()}>
          {tc("cancel")}
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 sm:grid-cols-2">
        <FormField label={t("brand")}>
          <Combobox
            value={data.brandId ?? ""}
            onChange={(v) => setField("brandId", v || null)}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
            searchable
            allowClear
          />
        </FormField>
        <FormField label={t("nameKo")} required>
          <Input value={data.nameKo} onChange={(e) => setField("nameKo", e.target.value)} placeholder="PTS-2100" />
        </FormField>
        <FormField label={t("nameVi")} required>
          <Input value={data.nameVi} onChange={(e) => setField("nameVi", e.target.value)} placeholder="PTS-2100" />
        </FormField>
        <FormField label={t("nameEn")} required>
          <Input value={data.nameEn} onChange={(e) => setField("nameEn", e.target.value)} placeholder="PTS-2100" />
        </FormField>
        <FormField label={t("inspectionEveryMonths")}>
          <Input
            value={data.inspectionEveryDays}
            onChange={(e) => setField("inspectionEveryDays", e.target.value)}
            inputMode="numeric"
            placeholder="1"
          />
        </FormField>
        <FormField label={t("warrantyMonths")}>
          <Input
            value={data.warrantyMonths}
            onChange={(e) => setField("warrantyMonths", e.target.value)}
            inputMode="numeric"
            placeholder="12"
          />
        </FormField>
        <FormField label={t("category")}>
          <Combobox
            value={data.category}
            onChange={(v) => setField("category", (v as CategoryValue | null) ?? null)}
            options={(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"] as const).map((c) => ({
              value: c,
              label: t(`categoryValues.${c}`),
            }))}
            searchable={false}
            allowClear
          />
        </FormField>
        <FormField label={t("isActive")}>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
            />
            {data.isActive ? tc("yes") : tc("no")}
          </label>
        </FormField>
        <FormField label={t("description")} className="sm:col-span-2">
          <Textarea
            value={data.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={3}
          />
        </FormField>
        <FormField label={t("retailPrice")}>
          <Input
            value={data.retailPrice}
            onChange={(e) => setField("retailPrice", e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />
        </FormField>
        <FormField label={t("monthlyRentalPrice")}>
          <Input
            value={data.monthlyRentalPrice}
            onChange={(e) => setField("monthlyRentalPrice", e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />
        </FormField>
        <FormField label={t("monthlyMaintenancePrice")}>
          <Input
            value={data.monthlyMaintenancePrice}
            onChange={(e) => setField("monthlyMaintenancePrice", e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />
        </FormField>
      </div>

      {/* Filter config — pick which filters this model uses (요청 A). Selecting a
          filter auto-fills its cycle; the cycle can be overridden per model. */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#111111]">{t("filterConfig")}</h2>
          <Button
            variant="secondary"
            size="sm"
            disabled={!filtersReady}
            onClick={() =>
              setFilters([...filters, { uid: newRowUid(), consumableId: "", quantity: "1", cycleOverride: "" }])
            }
          >
            {t("addFilter")}
          </Button>
        </div>
        {!filtersReady && !err && (
          <p className="text-xs text-[#737373]">{tc("loading")}</p>
        )}
        {(filtersReady || err) && filters.length === 0 && (
          <p className="text-xs text-[#737373]">—</p>
        )}
        {(filtersReady || err) && filters.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[24px_1fr_110px_90px_auto] items-center gap-2 text-[10px] uppercase tracking-wider text-[#a3a3a3]">
              <span>#</span>
              <span>{t("filterConfigCol.filter")}</span>
              <span>{t("filterConfigCol.cycleDays")}</span>
              <span>{t("filterConfigCol.quantity")}</span>
              <span />
            </div>
            {filters.map((f, idx) => {
              const picked = f.consumableId ? consumableById.get(f.consumableId) : null;
              const defaultCycle = picked?.replaceEveryDays ?? null;
              // Hide filters already chosen in other rows so the same filter
              // can't be added twice (the server rejects dupes, but with a
              // generic error — exclude them up front instead).
              const rowOptions = consumableOptions.filter(
                (o) => o.value === f.consumableId || !filters.some((g) => g !== f && g.consumableId === o.value),
              );
              return (
                <div key={f.uid} className="grid grid-cols-[24px_1fr_110px_90px_auto] items-center gap-2">
                  <span className="text-xs text-[#737373]">{idx + 1}</span>
                  <Combobox
                    value={f.consumableId || null}
                    onChange={(v) => updateFilter(idx, { consumableId: v ?? "" })}
                    options={rowOptions}
                    placeholder={t("filterConfigCol.filter")}
                    searchable
                    ariaLabel={`${t("filterConfigCol.filter")} ${idx + 1}`}
                  />
                  <Input
                    value={f.cycleOverride}
                    onChange={(e) => updateFilter(idx, { cycleOverride: e.target.value })}
                    inputMode="numeric"
                    placeholder={defaultCycle != null ? String(defaultCycle) : "—"}
                    aria-label={`${t("filterConfigCol.cycleDays")} ${idx + 1}`}
                  />
                  <Input
                    value={f.quantity}
                    onChange={(e) => updateFilter(idx, { quantity: e.target.value })}
                    inputMode="numeric"
                    placeholder="1"
                    aria-label={`${t("filterConfigCol.quantity")} ${idx + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters(filters.filter((_, i) => i !== idx))}
                  >
                    {tc("remove")}
                  </Button>
                </div>
              );
            })}
            <p className="text-xs text-[#737373]">{t("filterConfigHint")}</p>
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => finish()} disabled={busy}>
          {tc("cancel")}
        </Button>
        <Button
          onClick={submit}
          isLoading={busy}
          disabled={(!data.nameKo && !data.nameVi && !data.nameEn) || !filtersReady}
        >
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}
