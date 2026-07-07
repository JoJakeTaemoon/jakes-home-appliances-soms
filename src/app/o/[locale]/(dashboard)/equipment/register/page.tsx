"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiPageQuery, useApiQuery } from "@/lib/api/hooks";

type ServiceType = "RENTAL" | "MAINTENANCE" | "SALE";
type ManagementType = "FULL_SERVICE" | "SELF_MANAGED" | "OTHER";

interface CustomerListRow {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  shortcode: string | null;
}

interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  addressStreet: string | null;
  addressProvinceName: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  contacts: Array<{
    id: string;
    role: "CONTRACT_PARTY" | "OPS_CONTACT";
    isPrimary: boolean;
    name: string;
    title: string | null;
    phone1: string;
    email: string | null;
  }>;
  sites: Array<{ id: string; name: string }>;
}

interface ModelLite {
  id: string;
  modelCode: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  brand: { id: string; name: string } | null;
  productCategory: { id: string; nameKo: string; nameVi: string; nameEn: string } | null;
}

interface BrandLite { id: string; name: string }
interface CategoryLite { id: string; nameKo: string; nameVi: string; nameEn: string }
interface TechLite { id: string; username: string }

interface LineState {
  id: string;
  modelId: string | null;
  serviceType: ServiceType;
  managementType: ManagementType;
  quantity: number;
  deposit: number | null;
  monthlyFee: number | null;
  serialPrefix: string;
  installedAt: string; // optional override
}

function newLine(): LineState {
  return {
    id: `l-${Math.random().toString(36).slice(2, 9)}`,
    modelId: null,
    serviceType: "RENTAL",
    managementType: "FULL_SERVICE",
    quantity: 1,
    deposit: null,
    monthlyFee: null,
    serialPrefix: "",
    installedAt: "",
  };
}

export default function RegisterEquipmentPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[#737373]">Loading…</div>}>
      <RegisterEquipmentInner />
    </Suspense>
  );
}

function RegisterEquipmentInner() {
  const t = useTranslations("equipment.register");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const sp = useSearchParams();
  const api = useApi();

  const initialCustomerId = sp.get("customerId");
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [defaultInstalledAt, setDefaultInstalledAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [installedByTechnicianId, setInstalledByTechnicianId] = useState<string | null>(null);
  const [installNotes, setInstallNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([newLine()]);

  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [createContract, setCreateContract] = useState(false);
  const [contractTermMonths, setContractTermMonths] = useState(36);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customersListQuery = useApiPageQuery<CustomerListRow[]>(
    "/api/customers?status=ACTIVE&pageSize=500",
  );
  const customersList = customersListQuery.data?.data ?? [];

  const customerQuery = useApiQuery<CustomerDetail>(
    customerId ? `/api/customers/${customerId}` : null,
  );
  const customer = customerQuery.data ?? null;

  const modelsUrl = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("isActive", "true");
    qs.set("pageSize", "200");
    if (brandFilter) qs.set("brandId", brandFilter);
    if (categoryFilter) qs.set("categoryId", categoryFilter);
    return `/api/equipment-models?${qs.toString()}`;
  }, [brandFilter, categoryFilter]);
  const modelsQuery = useApiPageQuery<ModelLite[]>(modelsUrl);
  const models = modelsQuery.data?.data ?? [];

  const brandsQuery = useApiPageQuery<BrandLite[]>(
    "/api/admin/products/brands?pageSize=200",
  );
  const brands = brandsQuery.data?.data ?? [];

  const categoriesQuery = useApiPageQuery<CategoryLite[]>(
    "/api/admin/products/categories?pageSize=200",
  );
  const categories = categoriesQuery.data?.data ?? [];

  const techsQuery = useApiPageQuery<TechLite[]>(
    "/api/users?role=TECHNICIAN&pageSize=100",
  );
  const techs = techsQuery.data?.data ?? [];

  // ─── Derived ────────────────────────────────────────────────────────
  const customerAddress = customer
    ? [
        customer.addressStreet ?? customer.address,
        customer.district,
        customer.addressProvinceName ?? customer.city,
      ].filter(Boolean).join(", ")
    : "";
  const primaryContact =
    customer?.contacts.find((c) => c.role === "OPS_CONTACT" && c.isPrimary) ??
    customer?.contacts.find((c) => c.role === "CONTRACT_PARTY") ??
    customer?.contacts[0] ?? null;
  const noSitesForCustomer = !!customer && customer.sites.length === 0;

  const totals = useMemo(() => {
    let count = 0;
    let totalDeposit = 0;
    let totalMonthlyFee = 0;
    let totalSale = 0;
    for (const l of lines) {
      count += l.quantity;
      if (l.serviceType === "SALE") {
        totalSale += (l.monthlyFee ?? 0) * l.quantity;
      } else {
        totalDeposit += (l.deposit ?? 0) * l.quantity;
        totalMonthlyFee += (l.monthlyFee ?? 0) * l.quantity;
      }
    }
    return { count, totalDeposit, totalMonthlyFee, totalSale };
  }, [lines]);

  const canSubmit =
    !!customerId &&
    lines.length > 0 &&
    lines.every((l) => l.modelId && l.quantity > 0);

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }
  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  async function handleSubmit() {
    if (!customerId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{
        equipmentIds: string[];
        contractId: string | null;
      }>("/api/equipment/register", {
        customerId,
        siteId,
        defaultInstalledAt,
        installedByTechnicianId,
        installNotes,
        lines: lines.map((l) => ({
          modelId: l.modelId,
          serviceType: l.serviceType,
          managementType: l.managementType,
          quantity: l.quantity,
          deposit: l.deposit ?? undefined,
          monthlyFee: l.monthlyFee ?? undefined,
          serialPrefix: l.serialPrefix || undefined,
          installedAt: l.installedAt || undefined,
        })),
        createContract,
        contractTermMonths:
          createContract && lines.some((l) => l.serviceType !== "SALE")
            ? contractTermMonths
            : undefined,
      });
      if (res.data?.contractId) {
        router.push(`/o/contracts/${res.data.contractId}`);
      } else {
        router.push(`/o/customers/${customerId}?tab=equipment`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? tc("saving") : t("submit")}
        </Button>
      </header>

      {/* Common info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={t("sections.customer")}>
          <Field label={t("fields.customer")}>
            <Combobox
              value={customerId}
              onChange={(v) => {
                setCustomerId(v as string | null);
                setSiteId(null);
              }}
              options={customersList.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.code})`,
              }))}
              placeholder={customersListQuery.isLoading ? tc("loading") : t("fields.customerPlaceholder")}
              searchable
            />
          </Field>
          <Field label={t("fields.customerType")}>
            <ReadOnlyValue value={customer ? customer.type : "—"} />
          </Field>
          <Field label={t("fields.contact")}>
            <ReadOnlyValue
              value={
                primaryContact
                  ? `${primaryContact.name}${primaryContact.phone1 ? ` · ${primaryContact.phone1}` : ""}`
                  : "—"
              }
            />
          </Field>
          <Field label={tc("address")}>
            <ReadOnlyValue value={customerAddress || "—"} />
          </Field>
        </Section>

        <Section title={t("sections.location")}>
          <Field label={t("fields.site")}>
            {noSitesForCustomer ? (
              <ReadOnlyValue value={t("fields.siteNotApplicable")} />
            ) : (
              <Combobox
                value={siteId}
                onChange={(v) => setSiteId(v as string | null)}
                options={(customer?.sites ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                placeholder={customer ? t("fields.sitePlaceholder") : t("fields.pickCustomerFirst")}
                searchable
                disabled={!customer}
              />
            )}
          </Field>
          <Field label={t("fields.installedAt")}>
            <DatePicker
              value={defaultInstalledAt}
              onChange={setDefaultInstalledAt}
            />
          </Field>
          <Field label={t("fields.technician")}>
            <Combobox
              value={installedByTechnicianId}
              onChange={(v) => setInstalledByTechnicianId(v as string | null)}
              options={techs.map((u) => ({ value: u.id, label: u.username }))}
              placeholder="—"
              searchable
            />
          </Field>
          <Field label={tc("notes")}>
            <Textarea
              value={installNotes}
              onChange={(e) => setInstallNotes(e.target.value)}
              rows={2}
            />
          </Field>
        </Section>
      </div>

      {/* Model lines */}
      <Section title={t("sections.lines")}>
        {/* Brand + category filters apply to every line's model dropdown. */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("fields.brand")}>
            <Combobox
              value={brandFilter}
              onChange={(v) => setBrandFilter(v as string | null)}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={t("fields.brandPlaceholder")}
              searchable
            />
          </Field>
          <Field label={t("fields.category")}>
            <Combobox
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(v as string | null)}
              options={categories.map((c) => ({
                value: c.id,
                label: c.nameKo ?? c.nameEn ?? c.nameVi ?? c.id,
              }))}
              placeholder={t("fields.categoryPlaceholder")}
              searchable
            />
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" onClick={addLine}>
              {t("actions.addLine")}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left">{t("columns.model")}</th>
                <th className="px-2 py-2 text-left">{t("columns.serviceType")}</th>
                <th className="px-2 py-2 text-left">{t("columns.managementType")}</th>
                <th className="px-2 py-2 text-right">{t("columns.quantity")}</th>
                <th className="px-2 py-2 text-right">{t("columns.deposit")}</th>
                <th className="px-2 py-2 text-right">{t("columns.monthlyFee")}</th>
                <th className="px-2 py-2 text-left">{t("columns.serialPrefix")}</th>
                <th className="px-2 py-2 text-left">{t("columns.installedAt")}</th>
                <th className="px-2 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-2 py-2 min-w-[18rem]">
                    <Combobox
                      value={l.modelId}
                      onChange={(v) => updateLine(l.id, { modelId: v as string | null })}
                      options={models.map((m) => {
                        const name = pickModelName(m, locale);
                        const brand = m.brand?.name;
                        const cat = pickCategoryName(m.productCategory, locale);
                        const suffix = [brand, cat].filter(Boolean).join(" · ");
                        return {
                          value: m.id,
                          label: suffix ? `${name} (${suffix})` : name,
                        };
                      })}
                      placeholder={t("fields.modelPlaceholder")}
                      searchable
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Combobox
                      value={l.serviceType}
                      onChange={(v) => updateLine(l.id, { serviceType: (v ?? "RENTAL") as ServiceType })}
                      options={(["RENTAL", "MAINTENANCE", "SALE"] as const).map((v) => ({
                        value: v,
                        label: t(`serviceTypes.${v}`),
                      }))}
                      searchable={false}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Combobox
                      value={l.managementType}
                      onChange={(v) => updateLine(l.id, { managementType: (v ?? "FULL_SERVICE") as ManagementType })}
                      options={(["FULL_SERVICE", "SELF_MANAGED", "OTHER"] as const).map((v) => ({
                        value: v,
                        label: t(`managementTypes.${v}`),
                      }))}
                      searchable={false}
                    />
                  </td>
                  <td className="px-2 py-2 w-20 text-right">
                    <Input
                      type="number"
                      min={1}
                      value={String(l.quantity)}
                      onChange={(e) =>
                        updateLine(l.id, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2 w-32 text-right">
                    <MoneyInput
                      value={l.deposit}
                      onChange={(v) => updateLine(l.id, { deposit: v })}
                    />
                  </td>
                  <td className="px-2 py-2 w-32 text-right">
                    <MoneyInput
                      value={l.monthlyFee}
                      onChange={(v) => updateLine(l.id, { monthlyFee: v })}
                    />
                  </td>
                  <td className="px-2 py-2 w-32">
                    <Input
                      value={l.serialPrefix}
                      onChange={(e) => updateLine(l.id, { serialPrefix: e.target.value })}
                      placeholder={t("fields.serialPrefixPlaceholder")}
                    />
                  </td>
                  <td className="px-2 py-2 w-40">
                    <DatePicker
                      value={l.installedAt}
                      onChange={(v) => updateLine(l.id, { installedAt: v })}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(l.id)}
                      disabled={lines.length === 1}
                      className="text-xs text-red-600 disabled:text-gray-300"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Totals + contract */}
      <Section title={t("sections.summary")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label={t("totals.equipmentCount")} value={String(totals.count)} />
          <Stat label={t("totals.totalDeposit")} value={formatMoney(totals.totalDeposit)} />
          <Stat label={t("totals.totalMonthly")} value={formatMoney(totals.totalMonthlyFee)} />
          <Stat label={t("totals.totalSale")} value={formatMoney(totals.totalSale)} />
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={createContract}
            onChange={(e) => setCreateContract(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-2 border-gray-300"
          />
          <div className="flex-1">
            <div className="font-medium text-gray-900">{t("contract.toggle")}</div>
            <p className="mt-0.5 text-xs text-gray-500">{t("contract.toggleHint")}</p>
          </div>
        </label>
        {createContract && lines.some((l) => l.serviceType !== "SALE") && (
          <div className="mt-2">
            <Field label={t("contract.termMonths")}>
              <Input
                type="number"
                min={1}
                max={120}
                value={String(contractTermMonths)}
                onChange={(e) =>
                  setContractTermMonths(
                    Math.max(1, Math.min(120, Number(e.target.value) || 1)),
                  )
                }
              />
            </Field>
          </div>
        )}
      </Section>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────

function pickModelName(m: ModelLite, locale: string): string {
  if (locale === "ko") return m.nameKo ?? m.nameEn ?? m.nameVi ?? m.modelCode ?? m.id;
  if (locale === "en") return m.nameEn ?? m.nameKo ?? m.nameVi ?? m.modelCode ?? m.id;
  return m.nameVi ?? m.nameEn ?? m.nameKo ?? m.modelCode ?? m.id;
}

function pickCategoryName(
  c: ModelLite["productCategory"],
  locale: string,
): string | null {
  if (!c) return null;
  if (locale === "ko") return c.nameKo;
  if (locale === "en") return c.nameEn;
  return c.nameVi;
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}

function Section({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyValue({ value }: Readonly<{ value: string }>) {
  return (
    <div className="flex min-h-[2.25rem] items-center rounded-md border-2 border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      {value}
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
}: Readonly<{ value: number | null; onChange: (v: number | null) => void }>) {
  const [local, setLocal] = useState(value === null ? "" : String(value));
  return (
    <input
      type="number"
      value={local}
      min={0}
      onChange={(e) => {
        setLocal(e.target.value);
        const n = e.target.value.trim() === "" ? null : Number(e.target.value);
        onChange(n);
      }}
      className="w-full rounded-md border-2 border-gray-200 px-2 py-1.5 text-right text-sm"
    />
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}
