"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { SectionBadge } from "@/components/ui/section-badge";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { StockAdjustModal } from "@/components/inventory/stock-adjust-modal";
import { cn } from "@/lib/cn";

/** One row in the model's filter config (요청 A) — which filter, how many, and
 *  an optional per-model cycle override (empty = use the filter's own cycle). */
interface ModelFilterRow {
  uid: string;
  consumableId: string;
  quantity: string;
  cycleOverride: string;
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
  salePrice: string;
  purchasePrice: string;
  fixedPrice: string;
  safetyStock: string;
  monthlyRentalPrice: string;
  monthlyMaintenancePrice: string;
  inspectionEveryDays: string;
  warrantyMonths: string;
  isActive: boolean;
}

interface Props {
  initial?: Partial<ModelInput> & { id?: string; stockOnHand?: number };
  mode: "create" | "edit";
  onDone?: () => void;
  /** The page-level ActionBar drives Save via this ref (F5). */
  submitRef?: RefObject<(() => void) | null>;
  /** The page-level ActionBar focuses the form via this ref (F3 수정). */
  focusRef?: RefObject<(() => void) | null>;
  /** Called after a stock move so the list can refresh the on-hand column. */
  onStockChanged?: () => void;
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
  salePrice: "",
  purchasePrice: "",
  fixedPrice: "",
  safetyStock: "0",
  monthlyRentalPrice: "",
  monthlyMaintenancePrice: "",
  inspectionEveryDays: "",
  warrantyMonths: "12",
  isActive: true,
};

export function EquipmentModelForm({
  initial,
  mode,
  onDone,
  submitRef,
  focusRef,
  onStockChanged,
}: Readonly<Props>) {
  const t = useTranslations("equipmentModels");
  const tp = useTranslations("admin.products");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();
  const finish = () => {
    if (onDone) onDone();
    else router.push("/admin/products");
  };
  const [data, setData] = useState<ModelInput>({ ...EMPTY, ...initial });
  const [filters, setFilters] = useState<ModelFilterRow[]>([]);
  const [filtersReady, setFiltersReady] = useState(mode !== "edit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [consumables, setConsumables] = useState<ConsumableOpt[]>([]);
  const [stockOpen, setStockOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const stockOnHand = initial?.stockOnHand ?? 0;
  const safetyNum = Number(data.safetyStock || "0");
  const lowStock = mode === "edit" && stockOnHand < safetyNum;

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

  const num = (s: string) => (s ? Number(s) : null);

  // Field label + a "?" help tooltip explaining the pricing field.
  const priceLabel = (label: string, help: string) => (
    <span className="inline-flex items-center gap-1">
      {label}
      <HelpTooltip text={help} />
    </span>
  );

  async function submit() {
    if (busy || !filtersReady) return;
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
        retailPrice: num(data.retailPrice),
        salePrice: num(data.salePrice),
        purchasePrice: num(data.purchasePrice),
        fixedPrice: num(data.fixedPrice),
        safetyStock: data.safetyStock ? Number(data.safetyStock) : 0,
        monthlyRentalPrice: num(data.monthlyRentalPrice),
        monthlyMaintenancePrice: num(data.monthlyMaintenancePrice),
        inspectionEveryDays: num(data.inspectionEveryDays),
        warrantyMonths: num(data.warrantyMonths),
        ...(filtersReady ? { compatibleConsumables } : {}),
        // On create, opening stock starts at 0 — office receives stock via the
        // 조정 modal after the model exists.
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
  // Let the page-level ActionBar (F5 저장) call the latest submit closure.
  useEffect(() => {
    if (submitRef) submitRef.current = () => void submit();
    if (focusRef) focusRef.current = () => nameRef.current?.focus();
  });

  return (
    <div className="flex flex-col gap-4">
      {/* ① 모델 정보 */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <div className="mb-3 border-b border-[#f0f0f0] pb-2">
          <SectionBadge n={1} title={tp("secModelInfo")} />
        </div>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {/* LEFT — descriptive */}
          <div className="flex flex-col gap-3">
            <FormField label={t("displayNameKo")} required>
              <div className="flex flex-col gap-1">
                <Input ref={nameRef} value={data.nameKo} onChange={(e) => setField("nameKo", e.target.value)} placeholder="한국어 · PTS-2100" aria-label={t("displayNameKo")} />
                <Input value={data.nameVi} onChange={(e) => setField("nameVi", e.target.value)} placeholder="Tiếng Việt" aria-label={t("displayNameVi")} />
                <Input value={data.nameEn} onChange={(e) => setField("nameEn", e.target.value)} placeholder="English" aria-label={t("displayNameEn")} />
              </div>
            </FormField>
            <FormField label={t("category")} required>
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
            <FormField label={t("brand")} required>
              <Combobox
                value={data.brandId ?? ""}
                onChange={(v) => setField("brandId", v || null)}
                options={brands.map((b) => ({ value: b.id, label: b.name }))}
                searchable
                allowClear
              />
            </FormField>
            <FormField label={t("description")}>
              <Textarea value={data.description} onChange={(e) => setField("description", e.target.value)} rows={3} />
            </FormField>
            <FormField label={priceLabel(tp("salePrice"), tp("salePriceHelp"))}>
              <Input value={data.salePrice} onChange={(e) => setField("salePrice", e.target.value)} inputMode="numeric" placeholder="0" />
            </FormField>
          </div>

          {/* RIGHT — numeric */}
          <div className="flex flex-col gap-3">
            <FormField label={tp("stockOnHand")}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-9 flex-1 items-center rounded-lg border px-3 text-sm tabular-nums",
                    lowStock ? "border-red-300 bg-red-50 text-red-700" : "border-[#e5e5e5] bg-[#fafafa] text-[#111]",
                  )}
                >
                  {mode === "edit" ? stockOnHand.toLocaleString() : "—"}
                  {lowStock && <span className="ml-2 text-xs font-medium">{tp("lowStockBadge")}</span>}
                </span>
                {mode === "edit" && initial?.id && (
                  <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setStockOpen(true)}>
                    {tp("stockManage")}
                  </Button>
                )}
              </div>
            </FormField>
            <FormField label={priceLabel(tp("consumerPrice"), tp("retailPriceHelp"))}>
              <Input value={data.retailPrice} onChange={(e) => setField("retailPrice", e.target.value)} inputMode="numeric" placeholder="0" />
            </FormField>
            <FormField label={priceLabel(tp("purchasePrice"), tp("purchasePriceHelp"))}>
              <Input value={data.purchasePrice} onChange={(e) => setField("purchasePrice", e.target.value)} inputMode="numeric" placeholder="0" />
            </FormField>
            <FormField label={priceLabel(tp("fixedPrice"), tp("fixedPriceHelp"))}>
              <Input value={data.fixedPrice} onChange={(e) => setField("fixedPrice", e.target.value)} inputMode="numeric" placeholder="0" />
            </FormField>
          </div>
        </div>

        {/* secondary — kept fields not in the mockup (월렌탈료·월관리비·안전재고·점검·보증·활성) */}
        <div className="mt-3 grid gap-x-6 gap-y-3 border-t border-[#f0f0f0] pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label={t("monthlyRentalPrice")}>
            <Input value={data.monthlyRentalPrice} onChange={(e) => setField("monthlyRentalPrice", e.target.value)} inputMode="numeric" placeholder="0" />
          </FormField>
          <FormField label={t("monthlyMaintenancePrice")}>
            <Input value={data.monthlyMaintenancePrice} onChange={(e) => setField("monthlyMaintenancePrice", e.target.value)} inputMode="numeric" placeholder="0" />
          </FormField>
          <FormField label={tp("safetyStock")}>
            <Input value={data.safetyStock} onChange={(e) => setField("safetyStock", e.target.value)} inputMode="numeric" placeholder="0" />
          </FormField>
          <FormField label={t("inspectionEveryMonths")}>
            <Input value={data.inspectionEveryDays} onChange={(e) => setField("inspectionEveryDays", e.target.value)} inputMode="numeric" placeholder="1" />
          </FormField>
          <FormField label={t("warrantyMonths")}>
            <Input value={data.warrantyMonths} onChange={(e) => setField("warrantyMonths", e.target.value)} inputMode="numeric" placeholder="12" />
          </FormField>
          <FormField label={t("isActive")}>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={data.isActive} onChange={(e) => setField("isActive", e.target.checked)} />
              {data.isActive ? tc("yes") : tc("no")}
            </label>
          </FormField>
        </div>
      </div>

      {/* ② 필터 구성 */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <div className="mb-3 flex items-center justify-between border-b border-[#f0f0f0] pb-2">
          <SectionBadge n={2} title={t("filterConfig")} />
          <Button
            variant="secondary"
            size="sm"
            disabled={!filtersReady}
            onClick={() => setFilters([...filters, { uid: newRowUid(), consumableId: "", quantity: "1", cycleOverride: "" }])}
          >
            {t("addFilter")}
          </Button>
        </div>
        {!filtersReady && !err && <p className="text-xs text-[#737373]">{tc("loading")}</p>}
        {(filtersReady || err) && filters.length === 0 && <p className="text-xs text-[#737373]">—</p>}
        {(filtersReady || err) && filters.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-[#f0f0f0]">
            <table className="w-full text-sm">
              <thead className="bg-[#fafafa] text-[11px] uppercase tracking-wider text-[#737373]">
                <tr>
                  <th className="w-10 px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">{t("filterConfigCol.filter")}</th>
                  <th className="w-36 px-2 py-1.5 text-left">{t("filterConfigCol.cycleDays")}</th>
                  <th className="w-8 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {filters.map((f, idx) => {
                  const picked = f.consumableId ? consumableById.get(f.consumableId) : null;
                  const defaultCycle = picked?.replaceEveryDays ?? null;
                  const rowOptions = consumableOptions.filter(
                    (o) => o.value === f.consumableId || !filters.some((g) => g !== f && g.consumableId === o.value),
                  );
                  return (
                    <tr key={f.uid}>
                      <td className="px-2 py-1.5 text-xs text-[#737373]">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <Combobox
                          value={f.consumableId || null}
                          onChange={(v) => updateFilter(idx, { consumableId: v ?? "" })}
                          options={rowOptions}
                          placeholder={t("filterConfigCol.filter")}
                          searchable
                          ariaLabel={`${t("filterConfigCol.filter")} ${idx + 1}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={f.cycleOverride}
                          onChange={(e) => updateFilter(idx, { cycleOverride: e.target.value })}
                          inputMode="numeric"
                          placeholder={defaultCycle != null ? String(defaultCycle) : "—"}
                          aria-label={`${t("filterConfigCol.cycleDays")} ${idx + 1}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button" onClick={() => setFilters(filters.filter((_, i) => i !== idx))}
                          aria-label={tc("remove")} className="rounded px-1.5 py-0.5 text-sm text-red-600 hover:bg-red-50"
                        >✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(filtersReady || err) && <p className="mt-2 text-xs text-[#586a7c]">{t("filterConfigHint")}</p>}
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {mode === "edit" && initial?.id && (
        <StockAdjustModal
          open={stockOpen}
          onClose={() => setStockOpen(false)}
          itemKind="MODEL"
          itemId={initial.id}
          itemLabel={data.nameKo || data.nameVi || data.nameEn || ""}
          currentStock={stockOnHand}
          onDone={() => onStockChanged?.()}
        />
      )}
    </div>
  );
}
