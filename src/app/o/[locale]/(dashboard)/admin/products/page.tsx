"use client";

/**
 * UC-AD-05 — Product catalog admin (MANAGER+).
 *
 * Six tabs: Brands, Categories, Models, Consumables, Accessories, Charges.
 * Each tab supports CRUD against /api/admin/products/* (and the Models tab
 * also drives /api/equipment-models). Tables sort client-side by clicking a
 * column header (already paginated server-side at pageSize=100 — Phase 4
 * volumes fit comfortably in memory).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApi, ApiClientError } from "@/lib/api/client";
import { pickModelName } from "@/lib/products/name";

type ApiClient = ReturnType<typeof useApi>;
type Translate = ReturnType<typeof useTranslations>;
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EquipmentModelForm } from "@/components/forms/equipment-model-form";

type Tab = "brands" | "categories" | "models" | "consumables" | "accessories" | "charges";

/** Returns the row's display name in the current UI locale, with fallbacks. */
function pickLocaleName(
  row: { nameKo: string; nameVi: string; nameEn: string },
  locale: string,
): string {
  if (locale === "ko") return row.nameKo || row.nameVi || row.nameEn;
  if (locale === "en") return row.nameEn || row.nameVi || row.nameKo;
  return row.nameVi || row.nameKo || row.nameEn;
}

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
  modelCode: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  category: string | null;
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
  compatibleModels: { modelId: string; quantity: number; model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null } }[];
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
  compatibleModels: { modelId: string; quantity: number; model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null } }[];
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

interface ImportSummary {
  rowsProcessed: number;
  brandsCreated: number;
  categoriesCreated: number;
  modelsCreated: number;
  consumablesCreated: number;
  accessoriesCreated: number;
  linksCreated: number;
  duplicates: {
    brands: number;
    categories: number;
    models: number;
    consumables: number;
    accessories: number;
    links: number;
  };
  newItems: {
    brands: string[];
    categories: string[];
    models: string[];
    consumables: string[];
    accessories: string[];
  };
  warnings: string[];
}

type ImportResult =
  | { kind: "ok"; summary: ImportSummary }
  | { kind: "error"; message: string; details?: string[] };

export default function ProductCatalogPage() {
  const t = useTranslations("admin.products");
  const { user, accessToken } = useAuth();
  const api = useApi();
  const [tab, setTab] = useState<Tab>("brands");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const role = user?.role;
  const allowed = role === "ADMIN" || role === "MANAGER";

  async function uploadCatalogCsv(file: File) {
    if (!accessToken) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/products/import-catalog", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as
        | { success: true; data: ImportSummary }
        | { success: false; error?: { message?: string; issues?: { path: (string | number)[]; message: string }[] } }
        | null;
      if (!res.ok || !json || json.success === false) {
        const err = !json || json.success === true
          ? { message: `Upload failed (${res.status})`, issues: undefined }
          : json.error ?? { message: "Upload failed" };
        setImportResult({
          kind: "error",
          message: err.message ?? `Upload failed (${res.status})`,
          details: err.issues?.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
        return;
      }
      setImportResult({ kind: "ok", summary: json.data });
    } catch (err) {
      setImportResult({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(false);
    }
  }

  async function downloadCatalogCsv() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const res = await fetch("/api/admin/products/export-catalog", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        alert(`Download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
      a.download = filenameMatch?.[1] ?? "product-catalog.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

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
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-gray-600 mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadCatalogCsv(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            isLoading={importing}
          >
            {t("uploadCatalogCsv")}
          </Button>
          <Button variant="secondary" onClick={downloadCatalogCsv} isLoading={exporting}>
            {t("downloadCatalogCsv")}
          </Button>
        </div>
      </header>

      {importResult && (
        <ImportResultModal
          result={importResult}
          onClose={() => setImportResult(null)}
          t={t}
        />
      )}

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
              {t(TAB_LABEL_KEYS[key])}
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

const TAB_LABEL_KEYS: Record<Tab, string> = {
  brands: "tabBrands",
  categories: "tabCategories",
  models: "tabModels",
  consumables: "tabConsumables",
  accessories: "tabAccessories",
  charges: "tabCharges",
};

/** Renders the result of a CSV catalog upload — either an error explanation
 *  or a per-entity summary of new items + duplicate counts. */
function ImportResultModal({
  result,
  onClose,
  t,
}: Readonly<{ result: ImportResult; onClose: () => void; t: Translate }>) {
  if (result.kind === "error") {
    return (
      <Modal
        open
        onClose={onClose}
        title={t("importErrorTitle")}
        footer={<Button onClick={onClose}>{t("close")}</Button>}
      >
        <div className="space-y-3">
          <p className="text-sm text-red-700">{result.message}</p>
          {result.details && result.details.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-[#525252] space-y-1">
              {result.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    );
  }
  const s = result.summary;
  const totalNew =
    s.brandsCreated +
    s.categoriesCreated +
    s.modelsCreated +
    s.consumablesCreated +
    s.accessoriesCreated +
    s.linksCreated;
  const totalDup =
    s.duplicates.brands +
    s.duplicates.categories +
    s.duplicates.models +
    s.duplicates.consumables +
    s.duplicates.accessories +
    s.duplicates.links;
  return (
    <Modal
      open
      onClose={onClose}
      title={t("importDoneTitle")}
      footer={<Button onClick={onClose}>{t("close")}</Button>}
    >
      <div className="space-y-4 text-sm">
        <p className="text-[#525252]">
          {t("importRowsProcessed", { n: s.rowsProcessed })}
          {" · "}
          {t("importTotals", { added: totalNew, dup: totalDup })}
        </p>

        <SummaryGrid s={s} t={t} />

        <NewItemsList label={t("newBrands")} items={s.newItems.brands} />
        <NewItemsList label={t("newCategories")} items={s.newItems.categories} />
        <NewItemsList label={t("newModels")} items={s.newItems.models} />
        <NewItemsList label={t("newConsumables")} items={s.newItems.consumables} />
        <NewItemsList label={t("newAccessories")} items={s.newItems.accessories} />

        {s.warnings.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-amber-700">{t("importWarnings")}</div>
            <ul className="list-disc pl-5 text-xs text-amber-800 space-y-1">
              {s.warnings.slice(0, 20).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {s.warnings.length > 20 && (
                <li className="text-[#737373]">… +{s.warnings.length - 20}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SummaryGrid({ s, t }: Readonly<{ s: ImportSummary; t: Translate }>) {
  const cells: { label: string; created: number; dup: number }[] = [
    { label: t("tabBrands"), created: s.brandsCreated, dup: s.duplicates.brands },
    { label: t("tabCategories"), created: s.categoriesCreated, dup: s.duplicates.categories },
    { label: t("tabModels"), created: s.modelsCreated, dup: s.duplicates.models },
    { label: t("tabConsumables"), created: s.consumablesCreated, dup: s.duplicates.consumables },
    { label: t("tabAccessories"), created: s.accessoriesCreated, dup: s.duplicates.accessories },
    { label: t("compatibilityLinks"), created: s.linksCreated, dup: s.duplicates.links },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="rounded border border-border p-2">
          <div className="text-xs text-[#737373]">{c.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-semibold text-emerald-700">+{c.created}</span>
            <span className="text-xs text-[#737373]">/ {c.dup} {t("importDup")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewItemsList({ label, items }: Readonly<{ label: string; items: string[] }>) {
  if (items.length === 0) return null;
  const cap = 30;
  return (
    <div>
      <div className="text-xs font-semibold text-emerald-700">
        {label} ({items.length})
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.slice(0, cap).map((it) => (
          <span
            key={it}
            className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900 border border-emerald-200"
          >
            {it}
          </span>
        ))}
        {items.length > cap && (
          <span className="text-xs text-[#737373]">… +{items.length - cap}</span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Reusable helpers
// ───────────────────────────────────────────────────────────────────────────

interface SortState<C extends string> {
  column: C;
  direction: "asc" | "desc";
}

function useSort<C extends string>(initial: C): {
  sort: SortState<C>;
  onClick: (column: C) => void;
} {
  const [sort, setSort] = useState<SortState<C>>({ column: initial, direction: "asc" });
  const onClick = useCallback((column: C) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );
  }, []);
  return { sort, onClick };
}

function sortRows<T, C extends string>(
  rows: T[],
  sort: SortState<C>,
  accessors: Record<C, (row: T) => string | number | boolean | null | undefined>,
): T[] {
  const accessor = accessors[sort.column];
  if (!accessor) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    const an = av === null || av === undefined ? "" : av;
    const bn = bv === null || bv === undefined ? "" : bv;
    if (typeof an === "number" && typeof bn === "number") {
      return sort.direction === "asc" ? an - bn : bn - an;
    }
    if (typeof an === "boolean" && typeof bn === "boolean") {
      const a01 = an ? 1 : 0;
      const b01 = bn ? 1 : 0;
      return sort.direction === "asc" ? a01 - b01 : b01 - a01;
    }
    return sort.direction === "asc"
      ? String(an).localeCompare(String(bn))
      : String(bn).localeCompare(String(an));
  });
  return copy;
}

function SortableTh<C extends string>({
  column,
  sort,
  onClick,
  children,
  align = "left",
}: Readonly<{
  column: C;
  sort: SortState<C>;
  onClick: (c: C) => void;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}>) {
  const active = sort.column === column;
  const indicator = active ? (sort.direction === "asc" ? "▲" : "▼") : "↕";
  return (
    <th
      className={`p-2 border-b border-border text-${align} cursor-pointer select-none whitespace-nowrap`}
      onClick={() => onClick(column)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={`text-xs ${active ? "text-brand-blue-700" : "text-[#a3a3a3]"}`}>{indicator}</span>
      </span>
    </th>
  );
}

function StatusPill({ active, t }: Readonly<{ active: boolean; t: (k: string) => string }>) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active ? "bg-[#dcfce7] text-[#166534]" : "bg-[#f5f5f0] text-[#525252]"
      }`}
    >
      {active ? t("statusActive") : t("statusInactive")}
    </span>
  );
}

function RowActions({
  onEdit,
  onDelete,
  t,
}: Readonly<{ onEdit: () => void; onDelete: () => void; t: Translate }>) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onEdit}>
        {t("edit")}
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete}>
        {t("deactivate")}
      </Button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Brands
// ───────────────────────────────────────────────────────────────────────────

function BrandsTab({ api, t }: Readonly<{ api: ApiClient; t: Translate }>) {
  const [rows, setRows] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BrandRow | null>(null);
  const [deleting, setDeleting] = useState<BrandRow | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [error, setError] = useState<string | null>(null);
  const { sort, onClick } = useSort<"name" | "models" | "isActive">("name");

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
    // Brands tab loads its own list on mount and after mutations. The page
    // is too coupled (delete/edit modals share the load() handle) to migrate
    // to useApiQuery in this pass — tracked for a future follow-up.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submitCreate() {
    setError(null);
    try {
      await api.post("/api/admin/products/brands", form);
      setShowForm(false);
      setForm({ name: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    }
  }

  const sorted = useMemo(
    () =>
      sortRows(rows, sort, {
        name: (r) => r.name,
        models: (r) => r._count?.models ?? 0,
        isActive: (r) => r.isActive,
      }),
    [rows, sort],
  );

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}>+ {t("addBrand")}</Button>
      </div>
      {showForm && (
        <div className="border border-border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label={t("colName")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seoul Aqua" />
          </FormField>
          <div className="flex items-end gap-2">
            <Button onClick={submitCreate}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
          {error && <div className="md:col-span-2 text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <SortableTh column="name" sort={sort} onClick={onClick}>{t("colName")}</SortableTh>
            <SortableTh column="models" sort={sort} onClick={onClick} align="right">{t("colCompatibility")}</SortableTh>
            <SortableTh column="isActive" sort={sort} onClick={onClick}>{t("colActive")}</SortableTh>
            <th className="p-2 border-b border-border text-right">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={4} className="p-4 text-center">...</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-semibold">{r.name}</td>
                <td className="p-2 text-right text-xs">
                  {t("statusModelCount", { count: r._count?.models ?? 0 })}
                </td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
                <td className="p-2 text-right">
                  <RowActions t={t} onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {editing && (
        <BrandEditModal
          api={api}
          t={t}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          title={t("deactivate")}
          message={t("deactivateConfirm", { name: deleting.name })}
          confirmLabel={t("deactivate")}
          cancelLabel={t("cancel")}
          variant="danger"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.del(`/api/admin/products/brands/${deleting.id}`);
            } catch (err) {
              alert(err instanceof Error ? err.message : t("errorGeneric"));
            } finally {
              setDeleting(null);
              await load();
            }
          }}
        />
      )}
    </section>
  );
}

function BrandEditModal({ api, t, row, onClose, onSaved }: Readonly<{ api: ApiClient; t: Translate; row: BrandRow; onClose: () => void; onSaved: () => void }>) {
  const [name, setName] = useState(row.name);
  const [isActive, setIsActive] = useState(row.isActive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/api/admin/products/brands/${row.id}`, { name, isActive });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t("editBrand")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={save} isLoading={busy}>{t("save")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3">
        <FormField label={t("colName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t("statusActive")}
        </label>
      </div>
      {err && <div className="mt-3 text-red-600 text-sm">{err}</div>}
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Categories
// ───────────────────────────────────────────────────────────────────────────

function CategoriesTab({ api, t }: Readonly<{ api: ApiClient; t: Translate }>) {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState({ code: "", nameKo: "", nameVi: "", nameEn: "", sortOrder: 0 });
  const [error, setError] = useState<string | null>(null);
  const { sort, onClick } = useSort<"code" | "nameKo" | "nameVi" | "nameEn" | "sortOrder" | "isActive">("code");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CategoryRow[]>("/api/admin/products/categories?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function submitCreate() {
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

  const sorted = useMemo(
    () =>
      sortRows(rows, sort, {
        code: (r) => r.code,
        nameKo: (r) => r.nameKo,
        nameVi: (r) => r.nameVi,
        nameEn: (r) => r.nameEn,
        sortOrder: (r) => r.sortOrder,
        isActive: (r) => r.isActive,
      }),
    [rows, sort],
  );

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
            <Button onClick={submitCreate}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
          {error && <div className="md:col-span-5 text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <SortableTh column="code" sort={sort} onClick={onClick}>{t("colCode")}</SortableTh>
            <SortableTh column="nameKo" sort={sort} onClick={onClick}>{t("colNameKo")}</SortableTh>
            <SortableTh column="nameVi" sort={sort} onClick={onClick}>{t("colNameVi")}</SortableTh>
            <SortableTh column="nameEn" sort={sort} onClick={onClick}>{t("colNameEn")}</SortableTh>
            <SortableTh column="isActive" sort={sort} onClick={onClick}>{t("colActive")}</SortableTh>
            <th className="p-2 border-b border-border text-right">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="p-4 text-center">...</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-mono text-sm">{r.code}</td>
                <td className="p-2">{r.nameKo}</td>
                <td className="p-2">{r.nameVi}</td>
                <td className="p-2">{r.nameEn}</td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
                <td className="p-2 text-right">
                  <RowActions t={t} onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {editing && (
        <CategoryEditModal
          api={api}
          t={t}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          title={t("deactivate")}
          message={t("deactivateConfirm", { name: deleting.nameVi || deleting.code })}
          confirmLabel={t("deactivate")}
          cancelLabel={t("cancel")}
          variant="danger"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.del(`/api/admin/products/categories/${deleting.id}`);
            } catch (err) {
              alert(err instanceof Error ? err.message : t("errorGeneric"));
            } finally {
              setDeleting(null);
              await load();
            }
          }}
        />
      )}
    </section>
  );
}

function CategoryEditModal({ api, t, row, onClose, onSaved }: Readonly<{ api: ApiClient; t: Translate; row: CategoryRow; onClose: () => void; onSaved: () => void }>) {
  const [nameKo, setNameKo] = useState(row.nameKo);
  const [nameVi, setNameVi] = useState(row.nameVi);
  const [nameEn, setNameEn] = useState(row.nameEn);
  const [sortOrder, setSortOrder] = useState(row.sortOrder);
  const [isActive, setIsActive] = useState(row.isActive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/api/admin/products/categories/${row.id}`, { nameKo, nameVi, nameEn, sortOrder, isActive });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t("editCategory")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={save} isLoading={busy}>{t("save")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t("colCode")}>
          <Input value={row.code} disabled />
        </FormField>
        <FormField label={t("colSortOrder")}>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </FormField>
        <FormField label={t("colNameKo")}>
          <Input value={nameKo} onChange={(e) => setNameKo(e.target.value)} />
        </FormField>
        <FormField label={t("colNameVi")}>
          <Input value={nameVi} onChange={(e) => setNameVi(e.target.value)} />
        </FormField>
        <FormField label={t("colNameEn")}>
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t("statusActive")}
        </label>
      </div>
      {err && <div className="mt-3 text-red-600 text-sm">{err}</div>}
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Models
// ───────────────────────────────────────────────────────────────────────────

function ModelsTab({ api, t }: Readonly<{ api: ApiClient; t: Translate }>) {
  const locale = useLocale();
  const brands = useBrandOptions(api);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [deleting, setDeleting] = useState<ModelRow | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const { sort, onClick } = useSort<"name" | "brand" | "category" | "isActive">("name");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ModelRow[]>("/api/equipment-models?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => (brandFilter ? rows.filter((r) => r.brand?.id === brandFilter) : rows),
    [rows, brandFilter],
  );

  const sorted = useMemo(
    () =>
      sortRows(filtered, sort, {
        name: (r) => pickModelName(r, locale),
        brand: (r) => r.brand?.name ?? "",
        category: (r) => r.category ?? "",
        isActive: (r) => r.isActive,
      }),
    [filtered, sort, locale],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-60">
          <FormField label={t("colBrand")}>
            <Combobox
              value={brandFilter}
              onChange={setBrandFilter}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={t("filterAll")}
              allowClear
              ariaLabel={t("colBrand")}
            />
          </FormField>
        </div>
        <Button onClick={() => setCreating(true)}>+ {t("addModel")}</Button>
      </div>
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <SortableTh column="name" sort={sort} onClick={onClick}>{t("colNameKo")}</SortableTh>
            <SortableTh column="brand" sort={sort} onClick={onClick}>{t("colBrand")}</SortableTh>
            <SortableTh column="category" sort={sort} onClick={onClick}>{t("colCategory")}</SortableTh>
            <SortableTh column="isActive" sort={sort} onClick={onClick}>{t("colActive")}</SortableTh>
            <th className="p-2 border-b border-border text-right">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="p-4 text-center">...</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2">{pickModelName(r, locale)}</td>
                <td className="p-2 text-sm">{r.brand?.name ?? "—"}</td>
                <td className="p-2">{r.category ?? "—"}</td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
                <td className="p-2 text-right">
                  <RowActions t={t} onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title={t("addModel")}
          size="lg"
        >
          <EquipmentModelForm mode="create" onDone={() => { setCreating(false); void load(); }} />
        </Modal>
      )}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={t("editModel")}
          size="lg"
        >
          <EquipmentModelForm
            mode="edit"
            initial={{
              id: editing.id,
              nameKo: editing.nameKo ?? "",
              nameVi: editing.nameVi ?? "",
              nameEn: editing.nameEn ?? "",
              brandId: editing.brand?.id ?? null,
              category: (editing.category ?? null) as
                | "WATER_PURIFIER" | "BIDET" | "AIR_PURIFIER" | "FILTER" | "OTHER" | null,
              isActive: editing.isActive,
            }}
            onDone={() => { setEditing(null); void load(); }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          open
          title={t("deactivate")}
          message={t("deactivateConfirm", { name: pickModelName(deleting, locale) })}
          confirmLabel={t("deactivate")}
          cancelLabel={t("cancel")}
          variant="danger"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              // Model has no DELETE endpoint — PATCH isActive=false is the
              // soft-disable path that the equipment-models GET filter respects.
              await api.patch(`/api/equipment-models/${deleting.id}`, { isActive: false });
            } catch (err) {
              alert(err instanceof Error ? err.message : t("errorGeneric"));
            } finally {
              setDeleting(null);
              await load();
            }
          }}
        />
      )}
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

/** Active brands, used to populate brand filter dropdowns. */
function useBrandOptions(api: ApiClient): BrandRow[] {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await api.get<BrandRow[]>("/api/admin/products/brands?pageSize=100&isActive=true");
      setBrands(res.data);
    })();
  }, [api]);
  return brands;
}

// ───────────────────────────────────────────────────────────────────────────
// Consumables
// ───────────────────────────────────────────────────────────────────────────

function ConsumablesTab({ api, t }: Readonly<{ api: ApiClient; t: Translate }>) {
  const locale = useLocale();
  const tEq = useTranslations("equipmentModels");
  const models = useModelOptions(api);
  const brands = useBrandOptions(api);
  const [rows, setRows] = useState<ConsumableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ConsumableRow | null>(null);
  const [deleting, setDeleting] = useState<ConsumableRow | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  // Create-form-only: brand + category narrow which models the
  // CompatibilityPicker exposes for selection.
  const [formBrand, setFormBrand] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState<string | null>(null);
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
  const { sort, onClick } = useSort<"sku" | "nameVi" | "replaceEveryMonths" | "cleanEveryMonths" | "cleanOnEveryVisit" | "retailPrice" | "isActive">("sku");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ConsumableRow[]>("/api/admin/products/consumables?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function submitCreate() {
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

  // modelId → brandId, so the brand filter can narrow consumables by
  // following each consumable's compatibleModels.
  const modelToBrand = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const mo of models) m.set(mo.id, mo.brand?.id ?? null);
    return m;
  }, [models]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (modelFilter && !r.compatibleModels.some((cm) => cm.modelId === modelFilter)) return false;
      if (brandFilter && !r.compatibleModels.some((cm) => modelToBrand.get(cm.modelId) === brandFilter)) return false;
      return true;
    });
  }, [rows, brandFilter, modelFilter, modelToBrand]);

  const modelDropdownOptions = useMemo(
    () =>
      models
        .filter((m) => !brandFilter || m.brand?.id === brandFilter)
        .map((m) => ({ value: m.id, label: pickModelName(m, locale) })),
    [models, brandFilter, locale],
  );

  // Distinct category enum values present in the model catalog (legacy
  // `category` column on EquipmentModel: WATER_PURIFIER / BIDET / etc.).
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const m of models) {
      if (!m.category || seen.has(m.category)) continue;
      seen.add(m.category);
      out.push({ value: m.category, label: tEq(`categoryValues.${m.category}` as never) });
    }
    return out;
  }, [models, tEq]);

  // Bulk selector — replaces the create-form's compatibleModelIds with every
  // model matching the current (brand, category) tuple. When both are cleared,
  // the user's hand-curated selection is preserved (no destructive reset).
  // The user can then fine-tune by toggling individual model chips.
  function applyBulkSelect(brand: string | null, category: string | null) {
    if (!brand && !category) return;
    const matching = models
      .filter(
        (m) =>
          (!brand || m.brand?.id === brand) &&
          (!category || m.category === category),
      )
      .map((m) => m.id);
    setForm((f) => ({ ...f, compatibleModelIds: matching }));
  }

  const sorted = useMemo(
    () =>
      sortRows(filtered, sort, {
        sku: (r) => r.sku,
        nameVi: (r) => pickLocaleName(r, locale),
        replaceEveryMonths: (r) => r.replaceEveryMonths ?? -1,
        cleanEveryMonths: (r) => r.cleanEveryMonths ?? -1,
        cleanOnEveryVisit: (r) => r.cleanOnEveryVisit,
        retailPrice: (r) => Number(r.retailPrice),
        isActive: (r) => r.isActive,
      }),
    [filtered, sort, locale],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <FormField label={t("filterByBrand")}>
              <Combobox
                value={brandFilter}
                onChange={(v) => {
                  setBrandFilter(v);
                  // Drop a model filter that no longer matches the chosen brand.
                  if (v && modelFilter && modelToBrand.get(modelFilter) !== v) {
                    setModelFilter(null);
                  }
                }}
                options={brands.map((b) => ({ value: b.id, label: b.name }))}
                placeholder={t("filterAll")}
                allowClear
                ariaLabel={t("filterByBrand")}
              />
            </FormField>
          </div>
          <div className="w-72">
            <FormField label={t("filterByModel")}>
              <Combobox
                value={modelFilter}
                onChange={setModelFilter}
                options={modelDropdownOptions}
                placeholder={t("filterAll")}
                allowClear
                ariaLabel={t("filterByModel")}
              />
            </FormField>
          </div>
        </div>
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
              <Input type="number" value={form.replaceEveryMonths} onChange={(e) => setForm({ ...form, replaceEveryMonths: e.target.value })} />
            </FormField>
            <FormField label={t("colCleanCycle")}>
              <Input type="number" value={form.cleanEveryMonths} onChange={(e) => setForm({ ...form, cleanEveryMonths: e.target.value })} />
            </FormField>
            <FormField label={t("colRetailPrice")}>
              <Input type="number" value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) })} />
            </FormField>
            <FormField label={t("colCleanOnVisit")}>
              <label className="inline-flex items-center gap-2 mt-2">
                <input type="checkbox" checked={form.cleanOnEveryVisit} onChange={(e) => setForm({ ...form, cleanOnEveryVisit: e.target.checked })} />
                <span className="text-sm">{t("yes")}</span>
              </label>
            </FormField>
          </div>
          <FormField label={t("colCompatibility")}>
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Combobox
                  value={formBrand}
                  onChange={(v) => {
                    setFormBrand(v);
                    applyBulkSelect(v, formCategory);
                  }}
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  placeholder={t("colBrand")}
                  allowClear
                  ariaLabel={t("colBrand")}
                />
                <Combobox
                  value={formCategory}
                  onChange={(v) => {
                    setFormCategory(v);
                    applyBulkSelect(formBrand, v);
                  }}
                  options={categoryOptions}
                  placeholder={t("colCategory")}
                  allowClear
                  ariaLabel={t("colCategory")}
                />
              </div>
              <p className="text-xs text-text-secondary">{t("bulkSelectHint")}</p>
              <CompatibilityPicker models={models} selected={form.compatibleModelIds} onChange={(ids) => setForm({ ...form, compatibleModelIds: ids })} />
            </div>
          </FormField>
          <div className="flex gap-2">
            <Button onClick={submitCreate}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <SortableTh column="sku" sort={sort} onClick={onClick}>{t("colSku")}</SortableTh>
            <SortableTh column="nameVi" sort={sort} onClick={onClick}>{t("colNameLocaleAware", { locale: locale.toUpperCase() })}</SortableTh>
            <SortableTh column="replaceEveryMonths" sort={sort} onClick={onClick} align="right">{t("colReplaceCycle")}</SortableTh>
            <SortableTh column="cleanEveryMonths" sort={sort} onClick={onClick} align="right">{t("colCleanCycle")}</SortableTh>
            <SortableTh column="cleanOnEveryVisit" sort={sort} onClick={onClick} align="center">{t("colCleanOnVisit")}</SortableTh>
            <SortableTh column="retailPrice" sort={sort} onClick={onClick} align="right">{t("colRetailPrice")}</SortableTh>
            <th className="p-2 border-b border-border">{t("colCompatibility")}</th>
            <SortableTh column="isActive" sort={sort} onClick={onClick}>{t("colActive")}</SortableTh>
            <th className="p-2 border-b border-border text-right">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="p-4 text-center">...</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-mono text-sm">{r.sku}</td>
                <td className="p-2">{pickLocaleName(r, locale)}</td>
                <td className="p-2 text-right">{r.replaceEveryMonths ?? t("cycleNone")}</td>
                <td className="p-2 text-right">{r.cleanEveryMonths ?? t("cycleNone")}</td>
                <td className="p-2 text-center">{r.cleanOnEveryVisit ? "✓" : ""}</td>
                <td className="p-2 text-right">{Number(r.retailPrice).toLocaleString()}</td>
                <td className="p-2 text-xs">
                  {r.compatibleModels.map((m) => `${pickModelName(m.model, locale)}${m.quantity > 1 ? `×${m.quantity}` : ""}`).join(", ") || "—"}
                </td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
                <td className="p-2 text-right">
                  <RowActions t={t} onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {editing && (
        <ConsumableEditModal
          api={api}
          t={t}
          row={editing}
          models={models}
          brands={brands}
          categoryOptions={categoryOptions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          title={t("deactivate")}
          message={t("deactivateConfirm", { name: deleting.nameVi || deleting.sku })}
          confirmLabel={t("deactivate")}
          cancelLabel={t("cancel")}
          variant="danger"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.del(`/api/admin/products/consumables/${deleting.id}`);
            } catch (err) {
              alert(err instanceof Error ? err.message : t("errorGeneric"));
            } finally {
              setDeleting(null);
              await load();
            }
          }}
        />
      )}
    </section>
  );
}

function ConsumableEditModal({
  api, t, row, models, brands, categoryOptions, onClose, onSaved,
}: Readonly<{
  api: ApiClient;
  t: Translate;
  row: ConsumableRow;
  models: ModelRow[];
  brands: BrandRow[];
  categoryOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}>) {
  const [nameKo, setNameKo] = useState(row.nameKo);
  const [nameVi, setNameVi] = useState(row.nameVi);
  const [nameEn, setNameEn] = useState(row.nameEn);
  const [replaceEveryMonths, setReplaceEveryMonths] = useState(row.replaceEveryMonths?.toString() ?? "");
  const [cleanEveryMonths, setCleanEveryMonths] = useState(row.cleanEveryMonths?.toString() ?? "");
  const [cleanOnEveryVisit, setCleanOnEveryVisit] = useState(row.cleanOnEveryVisit);
  const [retailPrice, setRetailPrice] = useState(Number(row.retailPrice));
  const [isActive, setIsActive] = useState(row.isActive);
  const [compatibleModelIds, setCompatibleModelIds] = useState<string[]>(row.compatibleModels.map((m) => m.modelId));
  const [pickBrand, setPickBrand] = useState<string | null>(null);
  const [pickCategory, setPickCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Bulk selector — replaces compatibleModelIds with every model matching the
  // current (brand, category) tuple. When both are cleared, the user's hand-
  // curated selection is preserved (no destructive reset). After bulk-select
  // the user can fine-tune by toggling individual model chips.
  function applyBulkSelect(brand: string | null, category: string | null) {
    if (!brand && !category) return;
    setCompatibleModelIds(
      models
        .filter(
          (m) =>
            (!brand || m.brand?.id === brand) &&
            (!category || m.category === category),
        )
        .map((m) => m.id),
    );
  }
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/api/admin/products/consumables/${row.id}`, {
        nameKo, nameVi, nameEn,
        replaceEveryMonths: replaceEveryMonths === "" ? null : Number(replaceEveryMonths),
        cleanEveryMonths: cleanEveryMonths === "" ? null : Number(cleanEveryMonths),
        cleanOnEveryVisit,
        retailPrice,
        isActive,
        compatibleModels: compatibleModelIds.map((modelId) => ({ modelId, quantity: 1 })),
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t("editConsumable")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={save} isLoading={busy}>{t("save")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <FormField label={t("colSku")}><Input value={row.sku} disabled /></FormField>
          <FormField label={t("colNameKo")}><Input value={nameKo} onChange={(e) => setNameKo(e.target.value)} /></FormField>
          <FormField label={t("colNameVi")}><Input value={nameVi} onChange={(e) => setNameVi(e.target.value)} /></FormField>
          <FormField label={t("colNameEn")}><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></FormField>
          <FormField label={t("colReplaceCycle")}>
            <Input type="number" value={replaceEveryMonths} onChange={(e) => setReplaceEveryMonths(e.target.value)} />
          </FormField>
          <FormField label={t("colCleanCycle")}>
            <Input type="number" value={cleanEveryMonths} onChange={(e) => setCleanEveryMonths(e.target.value)} />
          </FormField>
          <FormField label={t("colRetailPrice")}>
            <Input type="number" value={retailPrice} onChange={(e) => setRetailPrice(Number(e.target.value))} />
          </FormField>
          <FormField label={t("colCleanOnVisit")}>
            <label className="inline-flex items-center gap-2 mt-2">
              <input type="checkbox" checked={cleanOnEveryVisit} onChange={(e) => setCleanOnEveryVisit(e.target.checked)} />
              <span className="text-sm">{t("yes")}</span>
            </label>
          </FormField>
        </div>
        <FormField label={t("colCompatibility")}>
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Combobox
                value={pickBrand}
                onChange={(v) => {
                  setPickBrand(v);
                  applyBulkSelect(v, pickCategory);
                }}
                options={brands.map((b) => ({ value: b.id, label: b.name }))}
                placeholder={t("colBrand")}
                allowClear
                ariaLabel={t("colBrand")}
              />
              <Combobox
                value={pickCategory}
                onChange={(v) => {
                  setPickCategory(v);
                  applyBulkSelect(pickBrand, v);
                }}
                options={categoryOptions}
                placeholder={t("colCategory")}
                allowClear
                ariaLabel={t("colCategory")}
              />
            </div>
            <p className="text-xs text-text-secondary">{t("bulkSelectHint")}</p>
            <CompatibilityPicker models={models} selected={compatibleModelIds} onChange={setCompatibleModelIds} />
          </div>
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t("statusActive")}
        </label>
      </div>
      {err && <div className="mt-3 text-red-600 text-sm">{err}</div>}
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Accessories
// ───────────────────────────────────────────────────────────────────────────

function AccessoriesTab({ api, t }: Readonly<{ api: ApiClient; t: Translate }>) {
  const locale = useLocale();
  const models = useModelOptions(api);
  const brands = useBrandOptions(api);
  const [rows, setRows] = useState<AccessoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccessoryRow | null>(null);
  const [deleting, setDeleting] = useState<AccessoryRow | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
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
  const { sort, onClick } = useSort<"sku" | "nameVi" | "isMinorPart" | "retailPrice" | "isActive">("sku");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AccessoryRow[]>("/api/admin/products/accessories?pageSize=100");
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function submitCreate() {
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

  // modelId → brandId, so the brand filter can narrow accessories by
  // following each accessory's compatibleModels.
  const modelToBrand = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const mo of models) m.set(mo.id, mo.brand?.id ?? null);
    return m;
  }, [models]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (modelFilter && !r.compatibleModels.some((cm) => cm.modelId === modelFilter)) return false;
      if (brandFilter && !r.compatibleModels.some((cm) => modelToBrand.get(cm.modelId) === brandFilter)) return false;
      return true;
    });
  }, [rows, brandFilter, modelFilter, modelToBrand]);

  const modelDropdownOptions = useMemo(
    () =>
      models
        .filter((m) => !brandFilter || m.brand?.id === brandFilter)
        .map((m) => ({ value: m.id, label: pickModelName(m, locale) })),
    [models, brandFilter, locale],
  );

  const sorted = useMemo(
    () =>
      sortRows(filtered, sort, {
        sku: (r) => r.sku,
        nameVi: (r) => pickLocaleName(r, locale),
        isMinorPart: (r) => r.isMinorPart,
        retailPrice: (r) => Number(r.retailPrice),
        isActive: (r) => r.isActive,
      }),
    [filtered, sort, locale],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <FormField label={t("filterByBrand")}>
              <Combobox
                value={brandFilter}
                onChange={(v) => {
                  setBrandFilter(v);
                  if (v && modelFilter && modelToBrand.get(modelFilter) !== v) {
                    setModelFilter(null);
                  }
                }}
                options={brands.map((b) => ({ value: b.id, label: b.name }))}
                placeholder={t("filterAll")}
                allowClear
                ariaLabel={t("filterByBrand")}
              />
            </FormField>
          </div>
          <div className="w-72">
            <FormField label={t("filterByModel")}>
              <Combobox
                value={modelFilter}
                onChange={setModelFilter}
                options={modelDropdownOptions}
                placeholder={t("filterAll")}
                allowClear
                ariaLabel={t("filterByModel")}
              />
            </FormField>
          </div>
        </div>
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
              <Input type="number" value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) })} />
            </FormField>
            <FormField label={t("colMinorPart")}>
              <label className="inline-flex items-center gap-2 mt-2">
                <input type="checkbox" checked={form.isMinorPart} onChange={(e) => setForm({ ...form, isMinorPart: e.target.checked })} />
                <span className="text-sm">{t("yes")}</span>
              </label>
            </FormField>
          </div>
          <FormField label={t("colCompatibility")}>
            <CompatibilityPicker models={models} selected={form.compatibleModelIds} onChange={(ids) => setForm({ ...form, compatibleModelIds: ids })} />
          </FormField>
          <div className="flex gap-2">
            <Button onClick={submitCreate}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      )}
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <SortableTh column="sku" sort={sort} onClick={onClick}>{t("colSku")}</SortableTh>
            <SortableTh column="nameVi" sort={sort} onClick={onClick}>{t("colNameLocaleAware", { locale: locale.toUpperCase() })}</SortableTh>
            <SortableTh column="isMinorPart" sort={sort} onClick={onClick} align="center">{t("colMinorPart")}</SortableTh>
            <SortableTh column="retailPrice" sort={sort} onClick={onClick} align="right">{t("colRetailPrice")}</SortableTh>
            <th className="p-2 border-b border-border">{t("colCompatibility")}</th>
            <SortableTh column="isActive" sort={sort} onClick={onClick}>{t("colActive")}</SortableTh>
            <th className="p-2 border-b border-border text-right">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="p-4 text-center">...</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 font-mono text-sm">{r.sku}</td>
                <td className="p-2">{pickLocaleName(r, locale)}</td>
                <td className="p-2 text-center">{r.isMinorPart ? "✓" : ""}</td>
                <td className="p-2 text-right">{Number(r.retailPrice).toLocaleString()}</td>
                <td className="p-2 text-xs">{r.compatibleModels.map((m) => pickModelName(m.model, locale)).join(", ") || "—"}</td>
                <td className="p-2"><StatusPill active={r.isActive} t={t} /></td>
                <td className="p-2 text-right">
                  <RowActions t={t} onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {editing && (
        <AccessoryEditModal
          api={api}
          t={t}
          row={editing}
          models={models}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          title={t("deactivate")}
          message={t("deactivateConfirm", { name: deleting.nameVi || deleting.sku })}
          confirmLabel={t("deactivate")}
          cancelLabel={t("cancel")}
          variant="danger"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.del(`/api/admin/products/accessories/${deleting.id}`);
            } catch (err) {
              alert(err instanceof Error ? err.message : t("errorGeneric"));
            } finally {
              setDeleting(null);
              await load();
            }
          }}
        />
      )}
    </section>
  );
}

function AccessoryEditModal({
  api, t, row, models, onClose, onSaved,
}: Readonly<{ api: ApiClient; t: Translate; row: AccessoryRow; models: ModelRow[]; onClose: () => void; onSaved: () => void }>) {
  const [nameKo, setNameKo] = useState(row.nameKo);
  const [nameVi, setNameVi] = useState(row.nameVi);
  const [nameEn, setNameEn] = useState(row.nameEn);
  const [isMinorPart, setIsMinorPart] = useState(row.isMinorPart);
  const [retailPrice, setRetailPrice] = useState(Number(row.retailPrice));
  const [isActive, setIsActive] = useState(row.isActive);
  const [compatibleModelIds, setCompatibleModelIds] = useState<string[]>(row.compatibleModels.map((m) => m.modelId));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/api/admin/products/accessories/${row.id}`, {
        nameKo, nameVi, nameEn,
        isMinorPart,
        retailPrice,
        isActive,
        compatibleModels: compatibleModelIds.map((modelId) => ({ modelId, quantity: 1 })),
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t("editAccessory")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={save} isLoading={busy}>{t("save")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <FormField label={t("colSku")}><Input value={row.sku} disabled /></FormField>
          <FormField label={t("colNameKo")}><Input value={nameKo} onChange={(e) => setNameKo(e.target.value)} /></FormField>
          <FormField label={t("colNameVi")}><Input value={nameVi} onChange={(e) => setNameVi(e.target.value)} /></FormField>
          <FormField label={t("colNameEn")}><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></FormField>
          <FormField label={t("colRetailPrice")}>
            <Input type="number" value={retailPrice} onChange={(e) => setRetailPrice(Number(e.target.value))} />
          </FormField>
          <FormField label={t("colMinorPart")}>
            <label className="inline-flex items-center gap-2 mt-2">
              <input type="checkbox" checked={isMinorPart} onChange={(e) => setIsMinorPart(e.target.checked)} />
              <span className="text-sm">{t("yes")}</span>
            </label>
          </FormField>
        </div>
        <FormField label={t("colCompatibility")}>
          <CompatibilityPicker models={models} selected={compatibleModelIds} onChange={setCompatibleModelIds} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t("statusActive")}
        </label>
      </div>
      {err && <div className="mt-3 text-red-600 text-sm">{err}</div>}
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Charges (read-only)
// ───────────────────────────────────────────────────────────────────────────

function ChargesTab({ api, t }: Readonly<{ api: ApiClient; t: Translate }>) {
  const [rows, setRows] = useState<ChargePolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { sort, onClick } = useSort<"part" | "contractType" | "warranty" | "chargeable">("part");

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

  const sorted = useMemo(
    () =>
      sortRows(rows, sort, {
        part: (r) => r.accessory?.sku ?? r.consumable?.sku ?? "",
        contractType: (r) => r.contractType,
        warranty: (r) => (r.contractType === "SALE" ? (r.withinWarranty ? 1 : 0) : -1),
        chargeable: (r) => r.isChargeable,
      }),
    [rows, sort],
  );

  return (
    <section className="space-y-4">
      <p className="text-sm text-gray-700">{t("chargeHint")}</p>
      <table className="w-full border border-border">
        <thead className="bg-muted">
          <tr>
            <SortableTh column="part" sort={sort} onClick={onClick}>{t("colPart")}</SortableTh>
            <SortableTh column="contractType" sort={sort} onClick={onClick}>{t("colContractType")}</SortableTh>
            <SortableTh column="warranty" sort={sort} onClick={onClick}>{t("colWarrantyState")}</SortableTh>
            <SortableTh column="chargeable" sort={sort} onClick={onClick}>{t("colChargeable")}</SortableTh>
            <th className="p-2 text-left border-b border-border">{t("colNotes")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="p-4 text-center">...</td></tr>
          ) : sorted.length === 0 ? (
            <tr><td colSpan={5} className="p-4 text-center text-gray-500">—</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="p-2 text-xs font-mono">
                  {r.accessory?.sku ?? r.consumable?.sku} ({r.accessory?.nameVi ?? r.consumable?.nameVi})
                </td>
                <td className="p-2">{r.contractType}</td>
                <td className="p-2">
                  {r.contractType === "SALE" ? (r.withinWarranty ? t("warrantyWithin") : t("warrantyAfter")) : "—"}
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

function CompatibilityPicker({
  models,
  selected,
  onChange,
}: Readonly<{ models: ModelRow[]; selected: string[]; onChange: (ids: string[]) => void }>) {
  const locale = useLocale();
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
            {pickModelName(m, locale)}
          </button>
        );
      })}
    </div>
  );
}
