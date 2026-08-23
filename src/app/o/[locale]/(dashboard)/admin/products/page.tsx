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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApi, ApiClientError } from "@/lib/api/client";
import { pickModelName } from "@/lib/products/name";
import { cycleToStored, cycleToDisplay } from "@/lib/catalog/cycle-unit";
import { cn } from "@/lib/cn";
import { foldDiacritics } from "@/lib/vn-text";

type ApiClient = ReturnType<typeof useApi>;
type Translate = ReturnType<typeof useTranslations>;
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SectionBadge } from "@/components/ui/section-badge";
import { FormField } from "@/components/ui/form-field";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RecordWorkspace } from "@/components/ui/record-workspace";
import { DetailActions, type DetailActionLabels } from "@/components/ui/detail-actions";
import { ModeField } from "@/components/ui/mode-field";
import { useRecordMode, type RecordMode } from "@/lib/hooks/use-record-mode";
import { StockAdjustModal } from "@/components/inventory/stock-adjust-modal";
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
  stockOnHand?: number;
  safetyStock?: number;
  retailPrice?: number | string | null;
  salePrice?: number | string | null;
  purchasePrice?: number | string | null;
  fixedPrice?: number | string | null;
}

interface ConsumableRow {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  replaceEveryDays: number | null;
  /** Input/display unit for replaceEveryDays; storage stays days. */
  replaceCycleUnit: "DAY" | "MONTH";
  cleanEveryDays: number | null;
  cleanOnEveryVisit: boolean;
  retailPrice: string;
  purchasePrice?: string | number | null;
  fixedPrice?: string | number | null;
  stockOnHand?: number;
  safetyStock?: number;
  spec?: string | null;
  mainUse?: string | null;
  notes?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  brand?: { id: string; name: string } | null;
  productCategory?: { id: string; nameKo: string; nameVi: string; nameEn: string } | null;
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

  async function downloadCatalog(format: "csv" | "xlsx") {
    if (!accessToken) return;
    setExporting(true);
    try {
      const qs = format === "xlsx" ? "?format=xlsx" : "";
      const res = await fetch(`/api/admin/products/export-catalog${qs}`, {
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
      a.download = filenameMatch?.[1] ?? `product-catalog.${format === "xlsx" ? "xls" : "csv"}`;
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
          <Button variant="secondary" onClick={() => downloadCatalog("csv")} isLoading={exporting}>
            {t("downloadCatalogCsv")}
          </Button>
          <Button variant="secondary" onClick={() => downloadCatalog("xlsx")} isLoading={exporting}>
            {t("downloadCatalogExcel")}
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
      {tab === "models" && <ModelsTab api={api} t={t} canManage={allowed} onExportExcel={() => downloadCatalog("xlsx")} />}
      {tab === "consumables" && (
        <ConsumablesTab api={api} t={t} canManage={allowed} onExportExcel={() => downloadCatalog("xlsx")} />
      )}
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

function ModelsTab({
  api,
  t,
  canManage,
  onExportExcel,
}: Readonly<{ api: ApiClient; t: Translate; canManage: boolean; onExportExcel: () => void }>) {
  const locale = useLocale();
  const tem = useTranslations("equipmentModels");
  // Localize the category enum for the list column (matches the form's combobox
  // labels); unknown values fall through to the raw string.
  const CATEGORY_KEYS = new Set(["WATER_PURIFIER", "BIDET", "AIR_PURIFIER", "FILTER", "OTHER"]);
  const catLabel = (c: string | null | undefined) =>
    c && CATEGORY_KEYS.has(c) ? tem(`categoryValues.${c}`) : (c ?? "—");
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Master-detail record machine (조회/수정/신규 등록): selecting a row → 조회,
  // [수정]/[신규등록] flip the shared left form editable. `formKey` remounts the
  // form on every transition except 수정 진입 (so entering edit keeps loaded state).
  const { mode, selected, isEditing, formKey, select, startEdit, startCreate, cancel, saved } =
    useRecordMode<ModelRow>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ModelRow | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { sort } = useSort<"name" | "brand" | "category" | "isActive">("name");
  const submitRef = useRef<(() => void) | null>(null);
  const focusRef = useRef<(() => void) | null>(null);

  const fetchRows = useCallback(async () => {
    const res = await api.get<ModelRow[]>("/api/equipment-models?pageSize=100");
    return res.data;
  }, [api]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchRows());
    } finally {
      setLoading(false);
    }
  }, [fetchRows]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = foldDiacritics(search.trim());
    if (!q) return rows;
    return rows.filter((r) =>
      foldDiacritics(`${r.nameKo ?? ""} ${r.nameVi ?? ""} ${r.nameEn ?? ""} ${r.brand?.name ?? ""} ${r.category ?? ""}`).includes(q),
    );
  }, [rows, search]);

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

  // After a save: reload the list, then re-sync the selection to the fresh row
  // (edit) or clear it (create) and return to 조회.
  const handleSaved = useCallback(async () => {
    const data = await fetchRows();
    setRows(data);
    saved(selected ? data.find((r) => r.id === selected.id) ?? null : null);
  }, [fetchRows, saved, selected]);

  const s = (v: number | string | null | undefined) => (v == null ? "" : String(Number(v)));
  const fmtPrice = (v: number | string | null | undefined) =>
    v == null ? "—" : Number(v).toLocaleString();

  const allChecked = sorted.length > 0 && sorted.every((r) => checkedIds.has(r.id));
  const toggleAll = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) sorted.forEach((r) => next.delete(r.id));
      else sorted.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const labels: DetailActionLabels = {
    view: t("stateView"),
    editing: t("stateEditing"),
    creating: t("stateCreating"),
    create: t("actNew"),
    edit: t("actEdit"),
    delete: t("actDelete"),
    save: t("actSave"),
    cancel: t("actCancel"),
  };

  const detailActions = (
    <DetailActions
      mode={mode}
      labels={labels}
      canManage={canManage}
      canEdit={selected != null}
      saving={saving}
      onCreate={startCreate}
      onEdit={() => { startEdit(); requestAnimationFrame(() => focusRef.current?.()); }}
      onDelete={() => selected && setDeleting(selected)}
      onSave={() => submitRef.current?.()}
      onCancel={cancel}
    />
  );

  const detail = (
    <EquipmentModelForm
      key={selected ? `row-${selected.id}-${formKey}` : `new-${formKey}`}
      mode={mode}
      submitRef={submitRef}
      focusRef={focusRef}
      headerActions={detailActions}
      onSavingChange={setSaving}
      onStockChanged={() => void load()}
      initial={
        selected
          ? {
              id: selected.id,
              nameKo: selected.nameKo ?? "",
              nameVi: selected.nameVi ?? "",
              nameEn: selected.nameEn ?? "",
              brandId: selected.brand?.id ?? null,
              category: (selected.category ?? null) as
                | "WATER_PURIFIER" | "BIDET" | "AIR_PURIFIER" | "FILTER" | "OTHER" | null,
              isActive: selected.isActive,
              stockOnHand: selected.stockOnHand ?? 0,
              safetyStock: s(selected.safetyStock),
              retailPrice: s(selected.retailPrice),
              salePrice: s(selected.salePrice),
              purchasePrice: s(selected.purchasePrice),
              fixedPrice: s(selected.fixedPrice),
            }
          : undefined
      }
      onDone={handleSaved}
    />
  );

  const list = (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
      {/* toolbar — list actions + search (stays put while the table scrolls) */}
      <div className="shrink-0 space-y-3 border-b border-[#f0f0f0] p-3">
        <div className="flex items-center justify-between gap-2">
          <SectionBadge n={4} title={t("secModelList")} />
          <div className="flex items-center gap-2">
            {canManage && checkedIds.size > 0 && (
              <Button variant="danger" size="sm" disabled={isEditing} onClick={() => setBulkOpen(true)}>
                {t("deactivate")} ({checkedIds.size})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onExportExcel}>{t("actExcel")}</Button>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <FormField label={`${t("searchDataLabel")} [F10]`}>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchModels")} data-catalog-search />
            </FormField>
          </div>
          <Button variant="secondary" onClick={() => { /* live filter */ }}>{t("searchLabel")}</Button>
        </div>
      </div>

      {/* scroll region — table with a sticky header */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-[#fafafa] text-[11px] uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="w-8 px-2 py-1.5 text-center">
                <input type="checkbox" checked={allChecked} disabled={isEditing} onChange={toggleAll} aria-label={t("colName")} />
              </th>
              <th className="px-2 py-1.5 text-left">#</th>
              <th className="px-2 py-1.5 text-left">{t("colName")}</th>
              <th className="px-2 py-1.5 text-left">{t("colCategory")}</th>
              <th className="px-2 py-1.5 text-left">{t("colBrand")}</th>
              <th className="px-2 py-1.5 text-right">{t("stockOnHand")}</th>
              <th className="px-2 py-1.5 text-right">{t("consumerPrice")}</th>
              <th className="px-2 py-1.5 text-right">{t("fixedPrice")}</th>
              <th className="px-2 py-1.5 text-right">{t("purchasePrice")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {loading && (
              <tr><td colSpan={9} className="p-4 text-center text-[#737373]">…</td></tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center text-[#737373]">{t("noModels")}</td></tr>
            )}
            {!loading &&
              sorted.map((r, i) => {
                const low = (r.stockOnHand ?? 0) < (r.safetyStock ?? 0);
                const isSel = selected?.id === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => { if (!isEditing) select(r); }}
                    aria-current={isSel ? "true" : undefined}
                    aria-disabled={isEditing || undefined}
                    className={cn(
                      isEditing ? "cursor-default" : "cursor-pointer hover:bg-[#f5f5f5]",
                      isSel && "bg-[var(--brand-blue-50)]",
                      isEditing && "opacity-50",
                      !r.isActive && "opacity-50",
                    )}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox" checked={checkedIds.has(r.id)}
                        disabled={isEditing}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleOne(r.id)}
                        aria-label={pickModelName(r, locale)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-[#737373]">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-[#111]">{pickModelName(r, locale)}</td>
                    <td className="px-2 py-1.5 text-[#586a7c]">{catLabel(r.category)}</td>
                    <td className="px-2 py-1.5 text-[#586a7c]">{r.brand?.name ?? "—"}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", low && "font-semibold text-red-600")}>
                      {(r.stockOnHand ?? 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtPrice(r.retailPrice)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtPrice(r.fixedPrice)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtPrice(r.purchasePrice)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <section>
      <RecordWorkspace detail={detail} list={list} heightClass="lg:h-[calc(100dvh-17rem)]" />

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
              // If the just-deactivated row is the one loaded in the left panel,
              // clear it so a stray Save can't re-activate the now-stale copy.
              if (selected?.id === deleting.id) select(null);
              setDeleting(null);
              await load();
            }
          }}
        />
      )}

      {bulkOpen && (
        <ConfirmDialog
          open
          title={t("deactivate")}
          message={t("deactivateConfirmBulk", { count: checkedIds.size })}
          confirmLabel={t("deactivate")}
          cancelLabel={t("cancel")}
          variant="danger"
          onCancel={() => setBulkOpen(false)}
          onConfirm={async () => {
            try {
              // Model has no DELETE endpoint — PATCH isActive=false soft-disables.
              await Promise.all([...checkedIds].map((id) => api.patch(`/api/equipment-models/${id}`, { isActive: false })));
            } catch (err) {
              alert(err instanceof Error ? err.message : t("errorGeneric"));
            } finally {
              if (selected && checkedIds.has(selected.id)) select(null);
              setCheckedIds(new Set());
              setBulkOpen(false);
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

function ConsumablesTab({
  api,
  t,
  canManage,
  onExportExcel,
}: Readonly<{ api: ApiClient; t: Translate; canManage: boolean; onExportExcel: () => void }>) {
  const locale = useLocale();
  const models = useModelOptions(api);
  const brands = useBrandOptions(api);
  const [rows, setRows] = useState<ConsumableRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Master-detail record machine (조회/수정/신규 등록) — same convention as the
  // Models tab; `formKey` remounts the form on every transition except 수정 진입.
  const { mode, selected, isEditing, formKey, select, startEdit, startCreate, cancel, saved } =
    useRecordMode<ConsumableRow>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ConsumableRow | null>(null);
  const submitRef = useRef<(() => void) | null>(null);
  const focusRef = useRef<(() => void) | null>(null);
  const [search, setSearch] = useState("");
  const { sort } = useSort<"sku" | "nameVi" | "replaceEveryDays" | "cleanEveryDays" | "cleanOnEveryVisit" | "retailPrice" | "isActive">("sku");

  const fetchRows = useCallback(async () => {
    const res = await api.get<ConsumableRow[]>("/api/admin/products/consumables?pageSize=100");
    return res.data;
  }, [api]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchRows());
    } finally {
      setLoading(false);
    }
  }, [fetchRows]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // After a save: reload, re-sync selection to the fresh row (edit) or clear it
  // (create), and return to 조회.
  const handleSaved = useCallback(async () => {
    const data = await fetchRows();
    setRows(data);
    saved(selected ? data.find((r) => r.id === selected.id) ?? null : null);
  }, [fetchRows, saved, selected]);

  const filtered = useMemo(() => {
    const q = foldDiacritics(search.trim());
    if (!q) return rows;
    return rows.filter((r) => foldDiacritics(`${r.sku} ${r.nameKo} ${r.nameVi} ${r.nameEn} ${r.spec ?? ""}`).includes(q));
  }, [rows, search]);

  const sorted = useMemo(
    () =>
      sortRows(filtered, sort, {
        sku: (r) => r.sku,
        nameVi: (r) => pickLocaleName(r, locale),
        replaceEveryDays: (r) => r.replaceEveryDays ?? -1,
        cleanEveryDays: (r) => r.cleanEveryDays ?? -1,
        cleanOnEveryVisit: (r) => r.cleanOnEveryVisit,
        retailPrice: (r) => Number(r.retailPrice),
        isActive: (r) => r.isActive,
      }),
    [filtered, sort, locale],
  );

  const fmtPrice = (v: number | string | null | undefined) => (v == null ? "—" : Number(v).toLocaleString());

  const labels: DetailActionLabels = {
    view: t("stateView"),
    editing: t("stateEditing"),
    creating: t("stateCreating"),
    create: t("actNew"),
    edit: t("actEdit"),
    delete: t("actDelete"),
    save: t("actSave"),
    cancel: t("actCancel"),
  };

  const detailActions = (
    <DetailActions
      mode={mode}
      labels={labels}
      canManage={canManage}
      canEdit={selected != null}
      saving={saving}
      onCreate={startCreate}
      onEdit={() => { startEdit(); requestAnimationFrame(() => focusRef.current?.()); }}
      onDelete={() => selected && setDeleting(selected)}
      onSave={() => submitRef.current?.()}
      onCancel={cancel}
    />
  );

  const detail = (
    <ConsumableForm
      key={selected ? `row-${selected.id}-${formKey}` : `new-${formKey}`}
      api={api}
      t={t}
      mode={mode}
      row={selected}
      models={models}
      brands={brands}
      submitRef={submitRef}
      focusRef={focusRef}
      headerActions={detailActions}
      onSavingChange={setSaving}
      onStockChanged={() => void load()}
      onDone={handleSaved}
    />
  );

  const list = (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
      {/* toolbar — list actions + search (stays put while the table scrolls) */}
      <div className="shrink-0 space-y-3 border-b border-[#f0f0f0] p-3">
        <div className="flex items-center justify-between gap-2">
          <SectionBadge n={3} title={t("secFilterList")} />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onExportExcel}>{t("actExcel")}</Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>{t("actReport")}</Button>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <FormField label={`${t("searchDataLabel")} [F10]`}>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchFilters")} data-catalog-search />
            </FormField>
          </div>
          <Button variant="secondary" onClick={() => { /* live filter — button is a visual affordance */ }}>
            {t("searchLabel")}
          </Button>
        </div>
      </div>

      {/* scroll region — table with a sticky header */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 z-10 bg-[#fafafa] text-[11px] uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="px-2 py-1.5 text-left">#</th>
              <th className="px-2 py-1.5 text-left">{t("colName")}</th>
              <th className="px-2 py-1.5 text-left">{t("colCategory")}</th>
              <th className="px-2 py-1.5 text-left">{t("colBrand")}</th>
              <th className="px-2 py-1.5 text-left">{t("spec")}</th>
              <th className="px-2 py-1.5 text-right">{t("colReplaceCycle")}</th>
              <th className="px-2 py-1.5 text-right">{t("stockOnHand")}</th>
              <th className="px-2 py-1.5 text-right">{t("consumerPrice")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {loading && <tr><td colSpan={8} className="p-4 text-center text-[#737373]">…</td></tr>}
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-[#737373]">{t("noConsumables")}</td></tr>
            )}
            {!loading &&
              sorted.map((r, i) => {
                const low = (r.stockOnHand ?? 0) < (r.safetyStock ?? 0);
                const isSel = selected?.id === r.id;
                const catName = r.productCategory
                  ? (locale === "vi" ? r.productCategory.nameVi : locale === "en" ? r.productCategory.nameEn : r.productCategory.nameKo)
                  : "—";
                return (
                  <tr
                    key={r.id}
                    onClick={() => { if (!isEditing) select(r); }}
                    aria-current={isSel ? "true" : undefined}
                    aria-disabled={isEditing || undefined}
                    className={cn(
                      isEditing ? "cursor-default" : "cursor-pointer hover:bg-[#f5f5f5]",
                      isSel && "bg-[var(--brand-blue-50)]",
                      isEditing && "opacity-50",
                      !r.isActive && "opacity-50",
                    )}
                  >
                    <td className="px-2 py-1.5 text-[#737373]">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-[#111]">{pickLocaleName(r, locale)}</td>
                    <td className="px-2 py-1.5 text-[#586a7c]">{catName}</td>
                    <td className="px-2 py-1.5 text-[#586a7c]">{r.brand?.name ?? "—"}</td>
                    <td className="px-2 py-1.5 text-[#586a7c]">{r.spec ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.replaceEveryDays ?? t("cycleNone")}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", low && "font-semibold text-red-600")}>
                      {(r.stockOnHand ?? 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtPrice(r.retailPrice)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <section>
      <RecordWorkspace detail={detail} list={list} heightClass="lg:h-[calc(100dvh-17rem)]" />

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
              // If the just-deactivated row is the one loaded in the left panel,
              // clear it so a stray Save can't re-activate the now-stale copy.
              if (selected?.id === deleting.id) select(null);
              setDeleting(null);
              await load();
            }
          }}
        />
      )}
    </section>
  );
}

interface AppliedModelRow {
  uid: string;
  modelId: string;
  quantity: string;
}
let appliedRowCounter = 0;

/** Filter (Consumable) form for the master-detail layout. Carries the filter's
 *  own info + the "적용 가능한 장비(모델)" editor (WS-3 re-adds bidirectional
 *  model links) + stock adjust. Renders read-only in 조회(view); the detail-panel
 *  DetailActions drives Save via submitRef. */
function ConsumableForm({
  api, t, mode, row, models, brands, onDone, submitRef, focusRef, onStockChanged, headerActions, onSavingChange,
}: Readonly<{
  api: ApiClient;
  t: Translate;
  mode: RecordMode;
  row: ConsumableRow | null;
  models: ModelRow[];
  brands: { id: string; name: string }[];
  onDone: () => void;
  submitRef: RefObject<(() => void) | null>;
  focusRef: RefObject<(() => void) | null>;
  onStockChanged: () => void;
  headerActions?: ReactNode;
  onSavingChange?: (saving: boolean) => void;
}>) {
  const locale = useLocale();
  const tc = useTranslations("common");
  const isEdit = mode === "edit";
  const isView = mode === "view";
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [sku, setSku] = useState(row?.sku ?? "");
  const [nameKo, setNameKo] = useState(row?.nameKo ?? "");
  const [nameVi, setNameVi] = useState(row?.nameVi ?? "");
  const [nameEn, setNameEn] = useState(row?.nameEn ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(row?.categoryId ?? null);
  const [brandId, setBrandId] = useState<string | null>(row?.brandId ?? null);
  const [spec, setSpec] = useState(row?.spec ?? "");
  const [mainUse, setMainUse] = useState(row?.mainUse ?? "");
  const [replaceCycleUnit, setReplaceCycleUnit] = useState<"DAY" | "MONTH">(row?.replaceCycleUnit ?? "DAY");
  const [replaceEveryDays, setReplaceEveryDays] = useState(
    row ? cycleToDisplay(row.replaceEveryDays, row.replaceCycleUnit) : "",
  );
  const [cleanEveryDays, setCleanEveryDays] = useState(row?.cleanEveryDays?.toString() ?? "");
  const [cleanOnEveryVisit, setCleanOnEveryVisit] = useState(row?.cleanOnEveryVisit ?? false);
  const [retailPrice, setRetailPrice] = useState(row ? String(Number(row.retailPrice)) : "");
  const [purchasePrice, setPurchasePrice] = useState(row?.purchasePrice != null ? String(Number(row.purchasePrice)) : "");
  const [fixedPrice, setFixedPrice] = useState(row?.fixedPrice != null ? String(Number(row.fixedPrice)) : "");
  const [safetyStock, setSafetyStock] = useState(String(row?.safetyStock ?? 0));
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [isActive, setIsActive] = useState(row?.isActive ?? true);
  const [applied, setApplied] = useState<AppliedModelRow[]>(
    (row?.compatibleModels ?? []).map((m) => ({ uid: `a${appliedRowCounter++}`, modelId: m.modelId, quantity: String(m.quantity) })),
  );
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [categories, setCategories] = useState<{ id: string; nameKo: string; nameVi: string; nameEn: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stockOnHand = row?.stockOnHand ?? 0;
  const lowStock = mode !== "create" && stockOnHand < Number(safetyStock || "0");
  const fmtMoney = (v: string) => (v ? Number(v).toLocaleString() : "");

  // Surface save-in-flight to the DetailActions spinner.
  useEffect(() => {
    onSavingChange?.(busy);
  }, [busy, onSavingChange]);

  useEffect(() => {
    void (async () => {
      try {
        const c = await api.get<{ id: string; nameKo: string; nameVi: string; nameEn: string }[]>(
          "/api/admin/products/categories?pageSize=100&isActive=true",
        );
        setCategories(c.data ?? []);
      } catch {
        /* categories optional */
      }
    })();
  }, [api]);

  const categoryName = (() => {
    const c = categories.find((x) => x.id === categoryId);
    if (!c) return "";
    return locale === "vi" ? c.nameVi : locale === "en" ? c.nameEn : c.nameKo;
  })();
  const brandName = brands.find((b) => b.id === brandId)?.name ?? "";
  const replaceView = replaceEveryDays
    ? `${replaceEveryDays} ${replaceCycleUnit === "DAY" ? t("cycleUnitDay") : t("cycleUnitMonth")}`
    : "";
  const nameView = (
    <span className="flex flex-col leading-tight">
      <span>{nameKo || "—"}</span>
      <span className="text-[#586a7c]">{nameVi || "—"}</span>
      <span className="text-[#586a7c]">{nameEn || "—"}</span>
    </span>
  );

  function switchUnit(v: string | null) {
    const nextUnit = (v as "DAY" | "MONTH") ?? "DAY";
    setReplaceEveryDays(cycleToDisplay(cycleToStored(replaceEveryDays, replaceCycleUnit), nextUnit));
    setReplaceCycleUnit(nextUnit);
  }

  const num = (s: string) => (s === "" ? null : Number(s));
  // Money fields: grouped digits via NumberInput(money), preserving the string
  // state + "empty = unset" semantics by mapping 0 ⇄ "".
  const money = (v: string, set: (s: string) => void) => ({
    value: v === "" ? 0 : Number(v),
    onChange: (n: number) => set(n === 0 ? "" : String(n)),
  });

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const compatibleModels = applied
        .filter((a) => a.modelId)
        .map((a) => ({ modelId: a.modelId, quantity: a.quantity ? Number(a.quantity) : 1 }));
      const payload = {
        nameKo, nameVi, nameEn,
        categoryId, brandId,
        spec: spec || undefined,
        mainUse: mainUse || undefined,
        notes: notes || undefined,
        replaceEveryDays: cycleToStored(replaceEveryDays, replaceCycleUnit),
        replaceCycleUnit,
        cleanEveryDays: cleanEveryDays === "" ? null : Number(cleanEveryDays),
        cleanOnEveryVisit,
        retailPrice: retailPrice === "" ? 0 : Number(retailPrice),
        purchasePrice: num(purchasePrice),
        fixedPrice: num(fixedPrice),
        safetyStock: Number(safetyStock || "0"),
        compatibleModels,
      };
      if (row) {
        await api.patch(`/api/admin/products/consumables/${row.id}`, { ...payload, isActive });
      } else {
        await api.post("/api/admin/products/consumables", { sku, ...payload });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (submitRef) submitRef.current = () => void save();
    if (focusRef) focusRef.current = () => nameRef.current?.focus();
  });

  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const availableModelOptions = models
    .filter((m) => !applied.some((a) => a.modelId === m.id))
    .map((m) => ({ value: m.id, label: pickModelName(m, locale) }));

  function addPendingModel() {
    if (!pendingModel || applied.some((a) => a.modelId === pendingModel)) return;
    setApplied([...applied, { uid: `a${appliedRowCounter++}`, modelId: pendingModel, quantity: "1" }]);
    setPendingModel(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ① 필터 정보 */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#f0f0f0] pb-2">
          <SectionBadge n={1} title={t("secFilterInfo")} />
          {headerActions}
        </div>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {/* LEFT — descriptive */}
          <div className="flex flex-col gap-3">
            <ModeField label={t("colName")} mode={mode} value={nameView}>
              <div className="flex flex-col gap-1">
                <Input ref={nameRef} value={nameKo} onChange={(e) => setNameKo(e.target.value)} placeholder="한국어" aria-label={t("colNameKo")} />
                <Input value={nameVi} onChange={(e) => setNameVi(e.target.value)} placeholder="Tiếng Việt" aria-label={t("colNameVi")} />
                <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="English" aria-label={t("colNameEn")} />
              </div>
            </ModeField>
            {/* SKU is immutable after creation — editable only in 신규 등록, read-only elsewhere. */}
            <ModeField label={t("colSku")} mode={mode === "create" ? "create" : "view"} value={sku}>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="FLT-NEW-001" />
            </ModeField>
            <ModeField label={t("colCategory")} mode={mode} value={categoryName}>
              <Combobox
                value={categoryId}
                onChange={(v) => setCategoryId(v || null)}
                options={categories.map((c) => ({ value: c.id, label: locale === "vi" ? c.nameVi : locale === "en" ? c.nameEn : c.nameKo }))}
                searchable allowClear ariaLabel={t("colCategory")}
              />
            </ModeField>
            <ModeField label={t("colBrand")} mode={mode} value={brandName}>
              <Combobox
                value={brandId}
                onChange={(v) => setBrandId(v || null)}
                options={brands.map((b) => ({ value: b.id, label: b.name }))}
                searchable allowClear ariaLabel={t("colBrand")}
              />
            </ModeField>
            <ModeField label={t("spec")} mode={mode} value={spec}>
              <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="9 inch" />
            </ModeField>
            <ModeField label={t("mainUse")} mode={mode} value={mainUse}>
              <Textarea value={mainUse} onChange={(e) => setMainUse(e.target.value)} rows={3} />
            </ModeField>
          </div>

          {/* RIGHT — numeric */}
          <div className="flex flex-col gap-3">
            <ModeField label={t("colReplaceCycle")} mode={mode} value={replaceView}>
              <div className="flex gap-2">
                <Input type="number" value={replaceEveryDays} onChange={(e) => setReplaceEveryDays(e.target.value)} />
                <div className="w-28 shrink-0">
                  <Combobox
                    value={replaceCycleUnit}
                    onChange={switchUnit}
                    options={[{ value: "DAY", label: t("cycleUnitDay") }, { value: "MONTH", label: t("cycleUnitMonth") }]}
                    searchable={false} allowClear={false} ariaLabel={t("colReplaceCycleUnit")}
                  />
                </div>
              </div>
            </ModeField>
            <FormField label={t("stockOnHand")}>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex h-9 flex-1 items-center rounded-lg border px-3 text-sm tabular-nums",
                  lowStock ? "border-red-300 bg-red-50 text-red-700" : "border-[#e5e5e5] bg-[#fafafa] text-[#111]",
                )}>
                  {mode !== "create" ? stockOnHand.toLocaleString() : "—"}
                  {lowStock && <span className="ml-2 text-xs font-medium">{t("lowStockBadge")}</span>}
                </span>
                {isEdit && (
                  <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setStockOpen(true)}>{t("stockManage")}</Button>
                )}
              </div>
            </FormField>
            <ModeField label={t("safetyStock")} mode={mode} value={safetyStock}>
              <Input type="number" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} />
            </ModeField>
            <ModeField label={t("consumerPrice")} mode={mode} value={fmtMoney(retailPrice)}>
              <NumberInput variant="money" min={0} {...money(retailPrice, setRetailPrice)} />
            </ModeField>
            <ModeField label={t("fixedPrice")} mode={mode} value={fmtMoney(fixedPrice)}>
              <NumberInput variant="money" min={0} {...money(fixedPrice, setFixedPrice)} />
            </ModeField>
            <ModeField label={t("purchasePrice")} mode={mode} value={fmtMoney(purchasePrice)}>
              <NumberInput variant="money" min={0} {...money(purchasePrice, setPurchasePrice)} />
            </ModeField>
          </div>
        </div>

        {/* secondary: cleaning cycle + active */}
        <div className="mt-3 grid gap-x-6 gap-y-3 border-t border-[#f0f0f0] pt-3 md:grid-cols-2">
          <ModeField label={t("colCleanCycle")} mode={mode} value={cleanEveryDays}>
            <Input type="number" value={cleanEveryDays} onChange={(e) => setCleanEveryDays(e.target.value)} />
          </ModeField>
          <ModeField label={t("colCleanOnVisit")} mode={mode} value={cleanOnEveryVisit ? t("yes") : tc("no")}>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={cleanOnEveryVisit} onChange={(e) => setCleanOnEveryVisit(e.target.checked)} />
              <span>{t("yes")}</span>
            </label>
          </ModeField>
          {mode !== "create" && (
            <ModeField label={t("colActive")} mode={mode} value={isActive ? t("statusActive") : t("statusInactive")}>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span>{t("statusActive")}</span>
              </label>
            </ModeField>
          )}
        </div>

        {/* 비고 — full width */}
        <div className="mt-3">
          <ModeField label={t("notes")} mode={mode} value={notes}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </ModeField>
        </div>
      </div>

      {/* ② 적용 가능한 장비(모델) */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <div className="mb-3 border-b border-[#f0f0f0] pb-2">
          <SectionBadge n={2} title={t("appliedModels")} />
        </div>
        {!isView && (
          <div className="mb-3 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Combobox
                value={pendingModel} onChange={setPendingModel}
                options={availableModelOptions} searchable allowClear
                placeholder={t("addModelPlaceholder")} ariaLabel={t("addModelLink")}
              />
            </div>
            <Button variant="secondary" onClick={addPendingModel} disabled={!pendingModel}>{tc("add")}</Button>
          </div>
        )}
        {applied.length === 0 ? (
          <p className="text-xs text-[#737373]">—</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#f0f0f0]">
            <table className="w-full text-sm">
              <thead className="bg-[#fafafa] text-[11px] uppercase tracking-wider text-[#737373]">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">{t("colName")}</th>
                  <th className="px-2 py-1.5 text-left">{t("colCategory")}</th>
                  <th className="px-2 py-1.5 text-left">{t("colBrand")}</th>
                  <th className="w-20 px-2 py-1.5 text-right">{t("colQuantity")}</th>
                  {!isView && <th className="w-8 px-2 py-1.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {applied.map((a, idx) => {
                  const m = modelById.get(a.modelId);
                  return (
                    <tr key={a.uid}>
                      <td className="px-2 py-1.5 text-[#737373]">{idx + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-[#111]">{m ? pickModelName(m, locale) : "—"}</td>
                      <td className="px-2 py-1.5 text-[#586a7c]">{m?.category ?? "—"}</td>
                      <td className="px-2 py-1.5 text-[#586a7c]">{m?.brand?.name ?? "—"}</td>
                      {isView ? (
                        <td className="px-2 py-1.5 text-right tabular-nums text-[#111]">{a.quantity || "1"}</td>
                      ) : (
                        <>
                          <td className="px-2 py-1.5 text-right">
                            <Input
                              value={a.quantity} inputMode="numeric" placeholder="1"
                              onChange={(e) => setApplied(applied.map((g, i) => (i === idx ? { ...g, quantity: e.target.value } : g)))}
                              aria-label={`${t("colQuantity")} ${idx + 1}`} className="h-8 text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button" onClick={() => setApplied(applied.filter((_, i) => i !== idx))}
                              aria-label={tc("remove")} className="rounded px-1.5 py-0.5 text-sm text-red-600 hover:bg-red-50"
                            >✕</button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {isEdit && row && (
        <StockAdjustModal
          open={stockOpen} onClose={() => setStockOpen(false)}
          itemKind="CONSUMABLE" itemId={row.id}
          itemLabel={nameKo || nameVi || nameEn || sku}
          currentStock={stockOnHand} onDone={onStockChanged}
        />
      )}
    </div>
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
