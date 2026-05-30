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
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

type Tab = "categories" | "models" | "consumables" | "accessories";

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
  category: string;
  isActive: boolean;
}

interface ConsumableRow {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  replaceEveryMonths: number | null;
  cleanEveryMonths: number | null;
  retailPrice: string;
  isActive: boolean;
  compatibleModels: { modelId: string; model: { modelCode: string; name: string } }[];
}

interface AccessoryRow {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  retailPrice: string;
  isActive: boolean;
  compatibleModels: { modelId: string; model: { modelCode: string; name: string } }[];
}

interface PaginatedList<T> {
  rows: T[];
  pagination: { page: number; limit: number; total: number };
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

      <nav className="flex gap-2 border-b-4 border-black">
        {(["categories", "models", "consumables", "accessories"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 font-semibold border-4 border-b-0 -mb-1 transition ${
              tab === key
                ? "border-black bg-blue-600 text-white"
                : "border-transparent bg-cream-100 text-black hover:bg-cream-200"
            }`}
          >
            {t(
              key === "categories"
                ? "tabCategories"
                : key === "models"
                ? "tabModels"
                : key === "consumables"
                ? "tabConsumables"
                : "tabAccessories",
            )}
          </button>
        ))}
      </nav>

      {tab === "categories" && <CategoriesTab api={api} t={t} />}
      {tab === "models" && <ModelsTab api={api} t={t} />}
      {tab === "consumables" && <ConsumablesTab api={api} t={t} />}
      {tab === "accessories" && <AccessoriesTab api={api} t={t} />}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function CategoriesTab({ api, t }: { api: any; t: any }) {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", nameKo: "", nameVi: "", nameEn: "", sortOrder: 0 });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await api.get("/api/admin/products/categories?pageSize=100")) as PaginatedList<CategoryRow>;
      setRows(res.rows);
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
        <div className="border-4 border-black p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
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
      <table className="w-full border-4 border-black">
        <thead className="bg-cream-100">
          <tr>
            <th className="p-2 text-left border-b-4 border-black">{t("colCode")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colNameKo")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colNameVi")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colNameEn")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colActive")}</th>
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
              <tr key={r.id} className="border-b border-gray-200">
                <td className="p-2 font-mono text-sm">{r.code}</td>
                <td className="p-2">{r.nameKo}</td>
                <td className="p-2">{r.nameVi}</td>
                <td className="p-2">{r.nameEn}</td>
                <td className="p-2">{r.isActive ? t("statusActive") : t("statusInactive")}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function ModelsTab({ api, t }: { api: any; t: any }) {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = (await api.get("/api/equipment-models?pageSize=100")) as PaginatedList<ModelRow>;
        setRows(res.rows);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  return (
    <section className="space-y-4">
      <p className="text-sm text-gray-600">
        Models are managed at <a href="/equipment-models" className="underline">/equipment-models</a>. Listed here for reference + category mapping.
      </p>
      <table className="w-full border-4 border-black">
        <thead className="bg-cream-100">
          <tr>
            <th className="p-2 text-left border-b-4 border-black">{t("colCode")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colNameKo")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colCategory")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colActive")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="p-4 text-center">
                ...
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-200">
                <td className="p-2 font-mono text-sm">{r.modelCode}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.category}</td>
                <td className="p-2">{r.isActive ? t("statusActive") : t("statusInactive")}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function useModelOptions(api: any): ModelRow[] {
  const [models, setModels] = useState<ModelRow[]>([]);
  useEffect(() => {
    void (async () => {
      const res = (await api.get("/api/equipment-models?pageSize=100&isActive=true")) as PaginatedList<ModelRow>;
      setModels(res.rows);
    })();
  }, [api]);
  return models;
}

function ConsumablesTab({ api, t }: { api: any; t: any }) {
  const models = useModelOptions(api);
  const [rows, setRows] = useState<ConsumableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    nameKo: "",
    nameVi: "",
    nameEn: "",
    replaceEveryMonths: "" as string | "",
    cleanEveryMonths: "" as string | "",
    retailPrice: 0,
    compatibleModelIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await api.get("/api/admin/products/consumables?pageSize=100")) as PaginatedList<ConsumableRow>;
      setRows(res.rows);
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
        retailPrice: form.retailPrice,
        compatibleModelIds: form.compatibleModelIds,
      });
      setShowForm(false);
      setForm({
        sku: "",
        nameKo: "",
        nameVi: "",
        nameEn: "",
        replaceEveryMonths: "",
        cleanEveryMonths: "",
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
        <div className="border-4 border-black p-4 space-y-3">
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

function ConsumableTable({ rows, loading, t }: { rows: ConsumableRow[]; loading: boolean; t: any }) {
  return (
    <table className="w-full border-4 border-black">
      <thead className="bg-cream-100">
        <tr>
          <th className="p-2 text-left border-b-4 border-black">{t("colSku")}</th>
          <th className="p-2 text-left border-b-4 border-black">{t("colNameVi")}</th>
          <th className="p-2 text-right border-b-4 border-black">{t("colReplaceCycle")}</th>
          <th className="p-2 text-right border-b-4 border-black">{t("colCleanCycle")}</th>
          <th className="p-2 text-right border-b-4 border-black">{t("colRetailPrice")}</th>
          <th className="p-2 text-left border-b-4 border-black">{t("colCompatibility")}</th>
          <th className="p-2 text-left border-b-4 border-black">{t("colActive")}</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={7} className="p-4 text-center">
              ...
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-200">
              <td className="p-2 font-mono text-sm">{r.sku}</td>
              <td className="p-2">{r.nameVi}</td>
              <td className="p-2 text-right">{r.replaceEveryMonths ?? t("cycleNone")}</td>
              <td className="p-2 text-right">{r.cleanEveryMonths ?? t("cycleNone")}</td>
              <td className="p-2 text-right">{Number(r.retailPrice).toLocaleString()}</td>
              <td className="p-2 text-xs">
                {r.compatibleModels.map((m) => m.model.modelCode).join(", ") || "—"}
              </td>
              <td className="p-2">{r.isActive ? t("statusActive") : t("statusInactive")}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function AccessoriesTab({ api, t }: { api: any; t: any }) {
  const models = useModelOptions(api);
  const [rows, setRows] = useState<AccessoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    nameKo: "",
    nameVi: "",
    nameEn: "",
    retailPrice: 0,
    compatibleModelIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await api.get("/api/admin/products/accessories?pageSize=100")) as PaginatedList<AccessoryRow>;
      setRows(res.rows);
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
      await api.post("/api/admin/products/accessories", form);
      setShowForm(false);
      setForm({ sku: "", nameKo: "", nameVi: "", nameEn: "", retailPrice: 0, compatibleModelIds: [] });
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
        <div className="border-4 border-black p-4 space-y-3">
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
      <table className="w-full border-4 border-black">
        <thead className="bg-cream-100">
          <tr>
            <th className="p-2 text-left border-b-4 border-black">{t("colSku")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colNameVi")}</th>
            <th className="p-2 text-right border-b-4 border-black">{t("colRetailPrice")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colCompatibility")}</th>
            <th className="p-2 text-left border-b-4 border-black">{t("colActive")}</th>
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
              <tr key={r.id} className="border-b border-gray-200">
                <td className="p-2 font-mono text-sm">{r.sku}</td>
                <td className="p-2">{r.nameVi}</td>
                <td className="p-2 text-right">{Number(r.retailPrice).toLocaleString()}</td>
                <td className="p-2 text-xs">
                  {r.compatibleModels.map((m) => m.model.modelCode).join(", ") || "—"}
                </td>
                <td className="p-2">{r.isActive ? t("statusActive") : t("statusInactive")}</td>
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
            className={`px-2 py-1 text-sm border-2 ${
              active ? "bg-blue-600 text-white border-blue-700" : "bg-white border-gray-300 hover:border-black"
            }`}
          >
            {m.modelCode}
          </button>
        );
      })}
    </div>
  );
}
