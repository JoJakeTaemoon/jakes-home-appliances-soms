"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";

interface FilterRow {
  type: string;
  replaceEveryDays: number;
}

type CategoryValue = "WATER_PURIFIER" | "BIDET" | "AIR_PURIFIER" | "FILTER" | "OTHER";

interface ModelInput {
  name: string;
  displayNameKo: string;
  displayNameVi: string;
  displayNameEn: string;
  brandId: string | null;
  category: CategoryValue | null;
  description: string;
  retailPrice: string;
  monthlyRentalPrice: string;
  monthlyMaintenancePrice: string;
  inspectionEveryMonths: string;
  warrantyMonths: string;
  filters: FilterRow[];
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

const EMPTY: ModelInput = {
  name: "",
  displayNameKo: "",
  displayNameVi: "",
  displayNameEn: "",
  brandId: null,
  category: null,
  description: "",
  retailPrice: "",
  monthlyRentalPrice: "",
  monthlyMaintenancePrice: "",
  inspectionEveryMonths: "",
  warrantyMonths: "12",
  filters: [],
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandOpt[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<BrandOpt[]>(
          "/api/admin/products/brands?pageSize=100&isActive=true",
        );
        setBrands(res.data ?? []);
      } catch (err) {
        // STAFF without catalog access gets 403 — that's expected, fall
        // through silently. Anything else (network, 5xx, schema drift) is
        // a real failure we want visible in the console.
        if (err instanceof ApiClientError && err.status === 403) return;
        console.warn("[equipment-model-form] failed to load brands", err);
      }
    })();
  }, [api]);

  function setField<K extends keyof ModelInput>(key: K, value: ModelInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        name: data.name,
        displayNameKo: data.displayNameKo || undefined,
        displayNameVi: data.displayNameVi || undefined,
        displayNameEn: data.displayNameEn || undefined,
        brandId: data.brandId,
        category: data.category ?? null,
        description: data.description || undefined,
        retailPrice: data.retailPrice ? Number(data.retailPrice) : null,
        monthlyRentalPrice: data.monthlyRentalPrice ? Number(data.monthlyRentalPrice) : null,
        monthlyMaintenancePrice: data.monthlyMaintenancePrice ? Number(data.monthlyMaintenancePrice) : null,
        inspectionEveryMonths: data.inspectionEveryMonths ? Number(data.inspectionEveryMonths) : null,
        warrantyMonths: data.warrantyMonths ? Number(data.warrantyMonths) : null,
        filterPolicy: data.filters.length > 0 ? { filters: data.filters } : null,
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
        <FormField label={t("name")} required>
          <Input value={data.name} onChange={(e) => setField("name", e.target.value)} />
        </FormField>
        <FormField label={t("brand")}>
          <Combobox
            value={data.brandId ?? ""}
            onChange={(v) => setField("brandId", v ? v : null)}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
            searchable
            allowClear
          />
        </FormField>
        <FormField label={t("displayNameKo")}>
          <Input value={data.displayNameKo} onChange={(e) => setField("displayNameKo", e.target.value)} placeholder="PTS-2100" />
        </FormField>
        <FormField label={t("displayNameVi")}>
          <Input value={data.displayNameVi} onChange={(e) => setField("displayNameVi", e.target.value)} placeholder="PTS-2100" />
        </FormField>
        <FormField label={t("displayNameEn")}>
          <Input value={data.displayNameEn} onChange={(e) => setField("displayNameEn", e.target.value)} placeholder="PTS-2100" />
        </FormField>
        <FormField label={t("inspectionEveryMonths")}>
          <Input
            value={data.inspectionEveryMonths}
            onChange={(e) => setField("inspectionEveryMonths", e.target.value)}
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

      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#111111]">{t("filterPolicy")}</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setField("filters", [...data.filters, { type: "", replaceEveryDays: 180 }])}
          >
            {t("addFilter")}
          </Button>
        </div>
        {data.filters.length === 0 ? (
          <p className="text-xs text-[#737373]">—</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.filters.map((f, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_auto]">
                <Input
                  value={f.type}
                  onChange={(e) => {
                    const next = [...data.filters];
                    next[idx] = { ...f, type: e.target.value };
                    setField("filters", next);
                  }}
                  placeholder={t("filterType")}
                />
                <Input
                  value={String(f.replaceEveryDays)}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10);
                    const next = [...data.filters];
                    next[idx] = { ...f, replaceEveryDays: Number.isFinite(v) ? v : 0 };
                    setField("filters", next);
                  }}
                  inputMode="numeric"
                  placeholder={t("replaceEveryDays")}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setField("filters", data.filters.filter((_, i) => i !== idx))}
                >
                  {tc("remove")}
                </Button>
              </div>
            ))}
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
        <Button onClick={submit} isLoading={busy} disabled={!data.name}>
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}
