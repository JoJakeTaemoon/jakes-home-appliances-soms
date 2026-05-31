"use client";

/**
 * UC-AD-05 — Product catalog admin (MANAGER+).
 *
 * Four tabs: Categories, Models, Consumables, Accessories. Each tab shows
 * a list (paginated) and an "Add" panel that POSTs to the corresponding
 * /api/admin/products/* route. Compatibility is selected via a simple
 * multi-select of equipment model codes. Editing & soft-delete are wired
 * directly to PATCH/DELETE on the detail routes; the UI re-fetches on
 * any mutation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";

// Shared aliases for the tab components below — drops the `any` blanket on
// every TabProps and gives autocomplete on api.get/post/patch + t("...").
type ApiClient = ReturnType<typeof useApi>;
type Translate = ReturnType<typeof useTranslations>;
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

type Tab = "brands" | "categories" | "models" | "consumables" | "accessories" | "charges";

interface BrandRow {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  _count?: { models: number };
}

interface CategoryRow {
  id: string;
  code: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
}

interface ModelRow {
  id: string;
  modelCode: string;
  name: string;
  displayNameKo: string | null;
  displayNameVi: string | null;
  displayNameEn: string | null;
  category: string;
  isActive: boolean;
  brand: { id: string; name: string } | null;
}

interface ConsumableRow {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  replaceEveryMonths: number | null;
  cleanEveryMonths: number | null;
  cleanOnEveryVisit: boolean;
  retailPrice: string;
  isActive: boolean;
  compatibleModels: { modelId: string; quantity: number; model: { modelCode: string; name: string } }[];
}

interface AccessoryRow {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  isMinorPart: boolean;
  retailPrice: string;
  isActive: boolean;
  compatibleModels: { modelId: string; quantity: number; model: { modelCode: string; name: string } }[];
}

interface ChargePolicyRow {
  id: string;
  accessoryId: string | null;
  consumableId: string | null;
  contractType: "RENTAL" | "SALE" | "MAINTENANCE";
  withinWarranty: boolean;
  isChargeable: boolean;
  notes: string | null;
  accessory: { sku: string; nameVi: string } | null;
  consumable: { sku: string; nameVi: string } | null;
}

export default function ProductCatalogPage() {
  const t = useTranslations("admin.products");
  const { user } = useAuth();
  const api = useApi();
  const [tab, setTab] = useState<Tab>("categories");

  const role = user?.role;
  const allowed = role === "ADMIN" || role === "MANAGER";

  if (!allowed) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-red-600">{t("notAllowed")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("subtitle")}</p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {(
          ["brands", "categories", "models", "consumables", "accessories", "charges"] as Tab[]
        ).map((key) => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(key)}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand-blue-500 text-brand-blue-700"
                  : "border-transparent text-[#525252] hover:bg-muted hover:text-brand-blue-700"
              }`}
            >
              {t(tabLabel(key))}
            </button>
          );
        })}
      </nav>

      {tab === "brands" && <BrandsTab api={api} t={t} />}
      {tab === "categories" && <CategoriesTab api={api} t={t} />}
      {tab === "models" && <ModelsTab api={api} t={t} />}
      {tab === "consumables" && <ConsumablesTab api={api} t={t} />}
      {tab === "accessories" && <AccessoriesTab api={api} t={t} />}
      {tab === "charges" && <ChargesTab api={api} t={t} />}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const TAB_LABEL_KEYS: Record<Tab, string> = {
  brands: "tabBrands",
  categories: "tabCategories",
  models: "tabModels",
  consumables: "tabConsumables",
  accessories: "tabAccessories",
  charges: "tabCharges",
};

function tabLabel(key: Tab): string {
  return TAB_LABEL_KEYS[key];
}

function StatusPill({ active, t }: { active: boolean; t: (k: string) => string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active
          ? "bg-[#dcfce7] text-[#166534]"
          : "bg-[#f5f5f0] text-[#525252]"
      }`}
    >
      {active ? t("statusActive") : t("statusInactive")}
    </span>
  );
}

function BrandsTab({ api, t }: { api: ApiClient; t: Translate }) {
  const [rows, setRows] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", sortOrder: 0 });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<BrandRow[]>("/api/admin/products/brands?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setError(null);
    try {
      await api.post("/api/admin/products/brands", form);
      setShowForm(false);
      setForm({ name: "", sortOrder: 0 });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}>+ {t("addBrand")}</Button>
      </div>
      {showForm && (
        <div className="border border-border p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label={t("colName")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seoul Aqua" />
          </FormField>
          <FormField label={t("colSortOrder")}>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </FormField>
          <div className="flex items-end gap-2">
            <Button onClick={submit}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              {t("cancel")}
            </Button>
          </div>
          {error && <div className="md:col-span-3 text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left border-b border-border">{t("colName")}</th>
            <th className="p-2 text-right border-b border-border">{t("colCompatibility")}</th>
            <th className="p-2 text-left border-b border-border">{t("colActive")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3} className="p-4 text-center">
                ...
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-semibold">{r.name}</td>
                <td className="p-2 text-right text-xs">
                  {t("statusModelCount", { count: r._count?.models ?? 0 })}
                </td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function ChargesTab({ api, t }: { api: ApiClient; t: Translate }) {
  const [rows, setRows] = useState<ChargePolicyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<ChargePolicyRow[]>("/api/admin/products/charge-policies?pageSize=100");
        setRows(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  return (
    <section className="space-y-4">
      <p className="text-sm text-gray-700">{t("chargeHint")}</p>
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left border-b border-border">{t("colPart")}</th>
            <th className="p-2 text-left border-b border-border">{t("colContractType")}</th>
            <th className="p-2 text-left border-b border-border">{t("colWarrantyState")}</th>
            <th className="p-2 text-left border-b border-border">{t("colChargeable")}</th>
            <th className="p-2 text-left border-b border-border">{t("colNotes")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="p-4 text-center">
                ...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-4 text-center text-gray-500">
                —
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 text-xs font-mono">
                  {r.accessory?.sku ?? r.consumable?.sku} ({r.accessory?.nameVi ?? r.consumable?.nameVi})
                </td>
                <td className="p-2">{r.contractType}</td>
                <td className="p-2">
                  {r.contractType === "SALE"
                    ? r.withinWarranty
                      ? t("warrantyWithin")
                      : t("warrantyAfter")
                    : "—"}
                </td>
                <td className="p-2">
                  <span className={r.isChargeable ? "text-red-600 font-semibold" : "text-green-700 font-semibold"}>
                    {r.isChargeable ? t("chargeBilled") : t("chargeFree")}
                  </span>
                </td>
                <td className="p-2 text-xs text-gray-600">{r.notes ?? ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function CategoriesTab({ api, t }: { api: ApiClient; t: Translate }) {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", nameKo: "", nameVi: "", nameEn: "", sortOrder: 0 });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CategoryRow[]>("/api/admin/products/categories?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setError(null);
    try {
      await api.post("/api/admin/products/categories", form);
      setShowForm(false);
      setForm({ code: "", nameKo: "", nameVi: "", nameEn: "", sortOrder: 0 });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}>+ {t("addCategory")}</Button>
      </div>
      {showForm && (
        <div className="border border-border p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <FormField label={t("colCode")}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DEHUMIDIFIER" />
          </FormField>
          <FormField label={t("colNameKo")}>
            <Input value={form.nameKo} onChange={(e) => setForm({ ...form, nameKo: e.target.value })} />
          </FormField>
          <FormField label={t("colNameVi")}>
            <Input value={form.nameVi} onChange={(e) => setForm({ ...form, nameVi: e.target.value })} />
          </FormField>
          <FormField label={t("colNameEn")}>
            <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          </FormField>
          <div className="flex items-end gap-2">
            <Button onClick={submit}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              {t("cancel")}
            </Button>
          </div>
          {error && <div className="md:col-span-5 text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left border-b border-border">{t("colCode")}</th>
            <th className="p-2 text-left border-b border-border">{t("colNameKo")}</th>
            <th className="p-2 text-left border-b border-border">{t("colNameVi")}</th>
            <th className="p-2 text-left border-b border-border">{t("colNameEn")}</th>
            <th className="p-2 text-left border-b border-border">{t("colActive")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="p-4 text-center">
                ...
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-mono text-sm">{r.code}</td>
                <td className="p-2">{r.nameKo}</td>
                <td className="p-2">{r.nameVi}</td>
                <td className="p-2">{r.nameEn}</td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function ModelsTab({ api, t }: { api: ApiClient; t: Translate }) {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<ModelRow[]>("/api/equipment-models?pageSize=100");
        setRows(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  return (
    <section className="space-y-4">
      <p className="text-sm text-[#525252]">
        {t("modelsHintLead")}{" "}
        <a href="/equipment-models" className="text-brand-blue-700 hover:underline">
          {t("modelsHintLink")}
        </a>
        {t("modelsHintTail")}
      </p>
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left border-b border-border">{t("colCode")}</th>
            <th className="p-2 text-left border-b border-border">{t("colNameKo")}</th>
            <th className="p-2 text-left border-b border-border">{t("colBrand")}</th>
            <th className="p-2 text-left border-b border-border">{t("colCategory")}</th>
            <th className="p-2 text-left border-b border-border">{t("colActive")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="p-4 text-center">
                ...
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-mono text-sm">{r.modelCode}</td>
                <td className="p-2">{r.displayNameKo ?? r.name}</td>
                <td className="p-2 text-sm">{r.brand?.name ?? "—"}</td>
                <td className="p-2">{r.category}</td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function useModelOptions(api: ApiClient): ModelRow[] {
  const [models, setModels] = useState<ModelRow[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await api.get<ModelRow[]>("/api/equipment-models?pageSize=100&isActive=true");
      setModels(res.data);
    })();
  }, [api]);
  return models;
}

function ConsumablesTab({ api, t }: { api: ApiClient; t: Translate }) {
  const models = useModelOptions(api);
  const [rows, setRows] = useState<ConsumableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    nameKo: "",
    nameVi: "",
    nameEn: "",
    replaceEveryMonths: "" as string,
    cleanEveryMonths: "" as string,
    cleanOnEveryVisit: false,
    retailPrice: 0,
    compatibleModelIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ConsumableRow[]>("/api/admin/products/consumables?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setError(null);
    try {
      await api.post("/api/admin/products/consumables", {
        sku: form.sku,
        nameKo: form.nameKo,
        nameVi: form.nameVi,
        nameEn: form.nameEn,
        replaceEveryMonths: form.replaceEveryMonths === "" ? null : Number(form.replaceEveryMonths),
        cleanEveryMonths: form.cleanEveryMonths === "" ? null : Number(form.cleanEveryMonths),
        cleanOnEveryVisit: form.cleanOnEveryVisit,
        retailPrice: form.retailPrice,
        compatibleModels: form.compatibleModelIds.map((modelId) => ({ modelId, quantity: 1 })),
      });
      setShowForm(false);
      setForm({
        sku: "",
        nameKo: "",
        nameVi: "",
        nameEn: "",
        replaceEveryMonths: "",
        cleanEveryMonths: "",
        cleanOnEveryVisit: false,
        retailPrice: 0,
        compatibleModelIds: [],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}>+ {t("addConsumable")}</Button>
      </div>
      {showForm && (
        <div className="border border-border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <FormField label={t("colSku")}>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="FLT-NEW-001" />
            </FormField>
            <FormField label={t("colNameKo")}>
              <Input value={form.nameKo} onChange={(e) => setForm({ ...form, nameKo: e.target.value })} />
            </FormField>
            <FormField label={t("colNameVi")}>
              <Input value={form.nameVi} onChange={(e) => setForm({ ...form, nameVi: e.target.value })} />
            </FormField>
            <FormField label={t("colNameEn")}>
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </FormField>
            <FormField label={t("colReplaceCycle")}>
              <Input
                type="number"
                value={form.replaceEveryMonths}
                onChange={(e) => setForm({ ...form, replaceEveryMonths: e.target.value })}
              />
            </FormField>
            <FormField label={t("colCleanCycle")}>
              <Input
                type="number"
                value={form.cleanEveryMonths}
                onChange={(e) => setForm({ ...form, cleanEveryMonths: e.target.value })}
              />
            </FormField>
            <FormField label={t("colRetailPrice")}>
              <Input
                type="number"
                value={form.retailPrice}
                onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) })}
              />
            </FormField>
            <FormField label={t("colCleanOnVisit")}>
              <label className="inline-flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={form.cleanOnEveryVisit}
                  onChange={(e) => setForm({ ...form, cleanOnEveryVisit: e.target.checked })}
                />
                <span className="text-sm">{t("yes")}</span>
              </label>
            </FormField>
          </div>
          <FormField label={t("colCompatibility")}>
            <CompatibilityPicker models={models} selected={form.compatibleModelIds} onChange={(ids) => setForm({ ...form, compatibleModelIds: ids })} />
          </FormField>
          <div className="flex gap-2">
            <Button onClick={submit}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              {t("cancel")}
            </Button>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <ConsumableTable rows={rows} loading={loading} t={t} />
    </section>
  );
}

function ConsumableTable({ rows, loading, t }: { rows: ConsumableRow[]; loading: boolean; t: Translate }) {
  return (
    <table className="w-full border border-border">
      <thead className="bg-muted">
        <tr>
          <th className="p-2 text-left border-b border-border">{t("colSku")}</th>
          <th className="p-2 text-left border-b border-border">{t("colNameVi")}</th>
          <th className="p-2 text-right border-b border-border">{t("colReplaceCycle")}</th>
          <th className="p-2 text-right border-b border-border">{t("colCleanCycle")}</th>
          <th className="p-2 text-center border-b border-border">{t("colCleanOnVisit")}</th>
          <th className="p-2 text-right border-b border-border">{t("colRetailPrice")}</th>
          <th className="p-2 text-left border-b border-border">{t("colCompatibility")}</th>
          <th className="p-2 text-left border-b border-border">{t("colActive")}</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={8} className="p-4 text-center">
              ...
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.id} className="border-b border-border">
              <td className="p-2 font-mono text-sm">{r.sku}</td>
              <td className="p-2">{r.nameVi}</td>
              <td className="p-2 text-right">{r.replaceEveryMonths ?? t("cycleNone")}</td>
              <td className="p-2 text-right">{r.cleanEveryMonths ?? t("cycleNone")}</td>
              <td className="p-2 text-center">{r.cleanOnEveryVisit ? "✓" : ""}</td>
              <td className="p-2 text-right">{Number(r.retailPrice).toLocaleString()}</td>
              <td className="p-2 text-xs">
                {r.compatibleModels
                  .map((m) => `${m.model.modelCode}${m.quantity > 1 ? `×${m.quantity}` : ""}`)
                  .join(", ") || "—"}
              </td>
              <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function AccessoriesTab({ api, t }: { api: ApiClient; t: Translate }) {
  const models = useModelOptions(api);
  const [rows, setRows] = useState<AccessoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    nameKo: "",
    nameVi: "",
    nameEn: "",
    isMinorPart: false,
    retailPrice: 0,
    compatibleModelIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AccessoryRow[]>("/api/admin/products/accessories?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setError(null);
    try {
      await api.post("/api/admin/products/accessories", {
        sku: form.sku,
        nameKo: form.nameKo,
        nameVi: form.nameVi,
        nameEn: form.nameEn,
        isMinorPart: form.isMinorPart,
        retailPrice: form.retailPrice,
        compatibleModels: form.compatibleModelIds.map((modelId) => ({ modelId, quantity: 1 })),
      });
      setShowForm(false);
      setForm({ sku: "", nameKo: "", nameVi: "", nameEn: "", isMinorPart: false, retailPrice: 0, compatibleModelIds: [] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}>+ {t("addAccessory")}</Button>
      </div>
      {showForm && (
        <div className="border border-border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <FormField label={t("colSku")}>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="ACC-NEW-001" />
            </FormField>
            <FormField label={t("colNameKo")}>
              <Input value={form.nameKo} onChange={(e) => setForm({ ...form, nameKo: e.target.value })} />
            </FormField>
            <FormField label={t("colNameVi")}>
              <Input value={form.nameVi} onChange={(e) => setForm({ ...form, nameVi: e.target.value })} />
            </FormField>
            <FormField label={t("colNameEn")}>
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </FormField>
            <FormField label={t("colRetailPrice")}>
              <Input
                type="number"
                value={form.retailPrice}
                onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) })}
              />
            </FormField>
            <FormField label={t("colMinorPart")}>
              <label className="inline-flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={form.isMinorPart}
                  onChange={(e) => setForm({ ...form, isMinorPart: e.target.checked })}
                />
                <span className="text-sm">{t("yes")}</span>
              </label>
            </FormField>
          </div>
          <FormField label={t("colCompatibility")}>
            <CompatibilityPicker models={models} selected={form.compatibleModelIds} onChange={(ids) => setForm({ ...form, compatibleModelIds: ids })} />
          </FormField>
          <div className="flex gap-2">
            <Button onClick={submit}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              {t("cancel")}
            </Button>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left border-b border-border">{t("colSku")}</th>
            <th className="p-2 text-left border-b border-border">{t("colNameVi")}</th>
            <th className="p-2 text-center border-b border-border">{t("colMinorPart")}</th>
            <th className="p-2 text-right border-b border-border">{t("colRetailPrice")}</th>
            <th className="p-2 text-left border-b border-border">{t("colCompatibility")}</th>
            <th className="p-2 text-left border-b border-border">{t("colActive")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="p-4 text-center">
                ...
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-mono text-sm">{r.sku}</td>
                <td className="p-2">{r.nameVi}</td>
                <td className="p-2 text-center">{r.isMinorPart ? "✓" : ""}</td>
                <td className="p-2 text-right">{Number(r.retailPrice).toLocaleString()}</td>
                <td className="p-2 text-xs">
                  {r.compatibleModels.map((m) => m.model.modelCode).join(", ") || "—"}
                </td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function CompatibilityPicker({
  models,
  selected,
  onChange,
}: {
  models: ModelRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const set = useMemo(() => new Set(selected), [selected]);
  function toggle(id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }
  return (
    <div className="flex flex-wrap gap-2">
      {models.map((m) => {
        const active = set.has(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-brand-blue-500 bg-brand-blue-50 text-brand-blue-700"
                : "border-border bg-white text-text-secondary hover:border-brand-blue-200 hover:bg-surface-hover"
            }`}
          >
            {m.modelCode}
          </button>
        );
      })}
    </div>
  );
}
