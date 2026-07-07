"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiPageQuery, useApiQuery } from "@/lib/api/hooks";

type ServiceType = "RENTAL" | "MAINTENANCE" | "SALE";
type ManagementType = "FULL_SERVICE" | "SELF_MANAGED" | "OTHER";
type SerialMode = "auto" | "manual" | "excel" | "paste";

interface CustomerListRow {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  shortcode: string | null;
}

interface CustomerLite {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  // Address fields surfaced by /api/customers/[id]. The InfoStep stitches
  // them into a single read-only line.
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
  sites: Array<{
    id: string;
    name: string;
    addressStreet: string | null;
    addressWardName: string | null;
    addressProvinceName: string | null;
    address: string | null;
    region: string | null;
  }>;
}

interface ModelLite {
  id: string;
  modelCode: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  brandId: string | null;
  brand: { id: string; name: string } | null;
  categoryId: string | null;
  productCategory: {
    id: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
  } | null;
}

interface BrandLite {
  id: string;
  name: string;
}

interface CategoryLite {
  id: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
}

interface RowState {
  id: string;
  serialNumber: string;
  assetCode: string;
  installedAt: string; // YYYY-MM-DD
}

const STEPS = ["info", "list", "confirm"] as const;

export default function BulkRegisterPage() {
  return (
    <Suspense fallback={null}>
      <BulkRegisterInner />
    </Suspense>
  );
}

function BulkRegisterInner() {
  const t = useTranslations("equipment.bulkRegister");
  const tc = useTranslations("common");
  const router = useRouter();
  const sp = useSearchParams();
  const api = useApi();

  const [step, setStep] = useState<(typeof STEPS)[number]>("info");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Step 1: common info ─────────────────────────────────────────────
  const initialCustomerId = sp.get("customerId");
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("RENTAL");
  const [managementType, setManagementType] = useState<ManagementType>("FULL_SERVICE");
  const [deposit, setDeposit] = useState<number | null>(null);
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null);
  const [defaultInstalledAt, setDefaultInstalledAt] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [installedByTechnicianId, setInstalledByTechnicianId] = useState<string | null>(null);
  const [installNotes, setInstallNotes] = useState("");
  // Brand + category filters narrow the model dropdown without forcing
  // the operator to scroll through the full catalog.
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // Step 3 option: mint a Contract bundling every equipment row in the
  // same transaction. SALE never gets a term; RENTAL defaults to 36mo.
  const [createContract, setCreateContract] = useState(false);
  const [contractTermMonths, setContractTermMonths] = useState<number>(36);

  // ─── Step 2: rows + serial mode ──────────────────────────────────────
  const [quantity, setQuantity] = useState<number>(5);
  const [serialMode, setSerialMode] = useState<SerialMode>("auto");
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<RowState[]>([]);

  // ─── Fetches ─────────────────────────────────────────────────────────
  // List of every active customer — feeds the searchable picker. Pulled
  // once and cached; 500 is enough headroom for current scale.
  const customersListQuery = useApiPageQuery<CustomerListRow[]>(
    "/api/customers?status=ACTIVE&pageSize=500",
  );
  const customersList = customersListQuery.data?.data ?? [];

  // Full detail of the picked customer — gives us address, primary
  // contact, and sites.
  const customerQuery = useApiQuery<CustomerLite>(
    customerId ? `/api/customers/${customerId}` : null,
  );
  const customer = customerQuery.data ?? null;

  // Brand + category filters are pushed to the server so the catalog
  // stays small even if it grows past pageSize. The Combobox below
  // reflects whichever filters are currently active.
  const modelsUrl = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("isActive", "true");
    qs.set("pageSize", "200");
    if (brandFilter) qs.set("brandId", brandFilter);
    if (categoryFilter) qs.set("categoryId", categoryFilter);
    return `/api/equipment-models?${qs.toString()}`;
  }, [brandFilter, categoryFilter]);
  const modelsQuery = useApiPageQuery<ModelLite[]>(modelsUrl);
  const models = modelsQuery.data?.data;

  const brandsQuery = useApiPageQuery<BrandLite[]>(
    "/api/admin/products/brands?pageSize=200",
  );
  const brands = brandsQuery.data?.data ?? [];

  const categoriesQuery = useApiPageQuery<CategoryLite[]>(
    "/api/admin/products/categories?pageSize=200",
  );
  const categories = categoriesQuery.data?.data ?? [];

  const techsQuery = useApiQuery<Array<{ id: string; username: string }>>(
    "/api/users?role=TECHNICIAN&pageSize=100",
  );
  const techs = techsQuery.data;

  // Resolve the selected model's code without depending on the array
  // identity (useApiQuery returns a fresh array reference on refetch,
  // which would re-fire the effect forever via `setRows`).
  const modelCode = useMemo(
    () => models?.find((m) => m.id === modelId)?.modelCode ?? null,
    [models, modelId],
  );

  // Regenerate rows when quantity / mode / default date / model changes.
  useEffect(() => {
    if (serialMode === "manual" || serialMode === "paste") return;
    setRows(buildRows(quantity, defaultInstalledAt, modelCode, serialMode));
  }, [quantity, defaultInstalledAt, modelCode, serialMode]);

  // ─── Validation ──────────────────────────────────────────────────────
  const canGoStep2 = !!(customerId && modelId && serviceType);
  const canGoStep3 = rows.length > 0 && rows.length === quantity;

  // ─── Submit ──────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!customerId || !modelId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{
        equipmentIds: string[];
        visitIds: string[];
        contractId: string | null;
        contractNumber: string | null;
        summary: { count: number; byInstallDate: Record<string, number> };
      }>("/api/equipment/bulk-register", {
        customerId,
        siteId,
        modelId,
        serviceType,
        managementType,
        deposit,
        monthlyFee,
        defaultInstalledAt,
        installedByTechnicianId,
        installNotes,
        rows: rows.map((r) => ({
          serialNumber: r.serialNumber || undefined,
          assetCode: r.assetCode || undefined,
          installedAt: r.installedAt,
        })),
        createContract,
        contractTermMonths:
          createContract && serviceType !== "SALE"
            ? contractTermMonths
            : undefined,
      });
      // If staff opted into the contract, drop them on the brand-new
      // contract detail page instead of bouncing through the customer's
      // equipment tab.
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
        <div className="flex gap-2">
          {step !== "info" && (
            <Button
              variant="secondary"
              onClick={() =>
                setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)])
              }
            >
              {t("prevStep")}
            </Button>
          )}
          {step !== "confirm" ? (
            <Button
              onClick={() => {
                if (step === "info" && !canGoStep2) return;
                if (step === "list" && !canGoStep3) return;
                setStep(STEPS[STEPS.indexOf(step) + 1]);
              }}
              disabled={(step === "info" && !canGoStep2) || (step === "list" && !canGoStep3)}
            >
              {t("nextStep")}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? tc("saving") : t("submitFinal")}
            </Button>
          )}
        </div>
      </header>

      <Stepper step={step} t={t} />

      {step === "info" && (
        <InfoStep
          t={t}
          tc={tc}
          customer={customer}
          customers={customersList}
          customersLoading={customersListQuery.isLoading}
          customerId={customerId}
          setCustomerId={setCustomerId}
          siteId={siteId}
          setSiteId={setSiteId}
          modelId={modelId}
          setModelId={setModelId}
          models={models ?? []}
          brands={brands}
          categories={categories}
          brandFilter={brandFilter}
          setBrandFilter={(v) => {
            setBrandFilter(v);
            // Clear the picked model if the new filter would hide it.
            setModelId(null);
          }}
          categoryFilter={categoryFilter}
          setCategoryFilter={(v) => {
            setCategoryFilter(v);
            setModelId(null);
          }}
          serviceType={serviceType}
          setServiceType={setServiceType}
          managementType={managementType}
          setManagementType={setManagementType}
          deposit={deposit}
          setDeposit={setDeposit}
          monthlyFee={monthlyFee}
          setMonthlyFee={setMonthlyFee}
          defaultInstalledAt={defaultInstalledAt}
          setDefaultInstalledAt={setDefaultInstalledAt}
          installedByTechnicianId={installedByTechnicianId}
          setInstalledByTechnicianId={setInstalledByTechnicianId}
          techs={techs ?? []}
          installNotes={installNotes}
          setInstallNotes={setInstallNotes}
        />
      )}

      {step === "list" && (
        <ListStep
          t={t}
          tc={tc}
          quantity={quantity}
          setQuantity={setQuantity}
          serialMode={serialMode}
          setSerialMode={setSerialMode}
          rows={rows}
          setRows={setRows}
          defaultInstalledAt={defaultInstalledAt}
          pasteText={pasteText}
          setPasteText={setPasteText}
        />
      )}

      {step === "confirm" && (
        <ConfirmStep
          t={t}
          quantity={quantity}
          deposit={deposit}
          monthlyFee={monthlyFee}
          rows={rows}
          serviceType={serviceType}
          createContract={createContract}
          setCreateContract={setCreateContract}
          contractTermMonths={contractTermMonths}
          setContractTermMonths={setContractTermMonths}
        />
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Sub-components ─────────────────────────────

function Stepper({
  step,
  t,
}: Readonly<{ step: (typeof STEPS)[number]; t: (k: string) => string }>) {
  return (
    <ol className="flex gap-2 rounded-lg border-2 border-gray-200 bg-white p-3 text-sm">
      {STEPS.map((s, i) => {
        const active = s === step;
        const done = STEPS.indexOf(step) > i;
        const tone = active
          ? "bg-blue-100 text-blue-700"
          : done
            ? "bg-green-100 text-green-700"
            : "bg-gray-100 text-gray-500";
        return (
          <li key={s} className="flex items-center gap-2">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${tone}`}>
              {i + 1}
            </span>
            <span className={active ? "font-semibold text-blue-700" : "text-gray-700"}>
              {t(`steps.${s}`)}
            </span>
            {i < STEPS.length - 1 && <span className="text-gray-300">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

interface InfoStepProps {
  t: (k: string) => string;
  tc: (k: string) => string;
  customer: CustomerLite | null;
  /** Searchable Combobox options. */
  customers: CustomerListRow[];
  customersLoading: boolean;
  customerId: string | null;
  setCustomerId: (v: string | null) => void;
  siteId: string | null;
  setSiteId: (v: string | null) => void;
  modelId: string | null;
  setModelId: (v: string | null) => void;
  models: ModelLite[];
  brands: BrandLite[];
  categories: CategoryLite[];
  brandFilter: string | null;
  setBrandFilter: (v: string | null) => void;
  categoryFilter: string | null;
  setCategoryFilter: (v: string | null) => void;
  serviceType: ServiceType;
  setServiceType: (v: ServiceType) => void;
  managementType: ManagementType;
  setManagementType: (v: ManagementType) => void;
  deposit: number | null;
  setDeposit: (v: number | null) => void;
  monthlyFee: number | null;
  setMonthlyFee: (v: number | null) => void;
  defaultInstalledAt: string;
  setDefaultInstalledAt: (v: string) => void;
  installedByTechnicianId: string | null;
  setInstalledByTechnicianId: (v: string | null) => void;
  techs: Array<{ id: string; username: string }>;
  installNotes: string;
  setInstallNotes: (v: string) => void;
}

function InfoStep(props: Readonly<InfoStepProps>) {
  const { t, tc, customer, customers, customersLoading, customerId, setCustomerId, siteId, setSiteId } = props;

  // Composite address line — joined non-empty parts so empty fields don't
  // leave dangling commas.
  const customerAddress = customer
    ? [
        customer.addressStreet ?? customer.address,
        customer.district,
        customer.addressProvinceName ?? customer.city,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  // Primary OPS first, then CONTRACT_PARTY as a fallback so the row is
  // never empty for a fully-seeded customer.
  const primaryContact =
    customer?.contacts.find((c) => c.role === "OPS_CONTACT" && c.isPrimary) ??
    customer?.contacts.find((c) => c.role === "CONTRACT_PARTY") ??
    customer?.contacts[0] ??
    null;

  // Site options come from the picked customer. B2C usually has no Site
  // (equipment attaches to the customer directly) so the picker stays
  // empty + disabled with a clear hint.
  const siteOptions = (customer?.sites ?? []).map((s) => ({
    value: s.id,
    label: [s.name, s.addressWardName].filter(Boolean).join(" · "),
  }));
  const noSitesForCustomer = !!customer && customer.sites.length === 0;
  const selectedSite = customer?.sites.find((s) => s.id === siteId) ?? null;
  const siteAddress = selectedSite
    ? [
        selectedSite.addressStreet ?? selectedSite.address,
        selectedSite.addressWardName,
        selectedSite.addressProvinceName,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title={t("sections.customer")}>
        <Field label={t("fields.customerName")}>
          <Combobox
            value={customerId}
            onChange={(v) => {
              setCustomerId(v as string | null);
              // Reset the site picker when the customer changes — a site
              // belonging to the old customer is no longer valid.
              setSiteId(null);
            }}
            options={customers.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.code})${c.shortcode ? ` · ${c.shortcode}` : ""}`,
            }))}
            placeholder={customersLoading ? tc("loading") : t("fields.customerPlaceholder")}
            searchable
          />
        </Field>
        <Field label={t("fields.customerType")}>
          <ReadOnlyValue value={customer ? customer.type : "—"} />
        </Field>
        <Field label={t("fields.primaryContact")}>
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
              options={siteOptions}
              placeholder={
                customer
                  ? t("fields.sitePlaceholder")
                  : t("fields.pickCustomerFirst")
              }
              searchable
              disabled={!customer}
            />
          )}
        </Field>
        {siteAddress && (
          <Field label={t("fields.siteAddress")}>
            <ReadOnlyValue value={siteAddress} />
          </Field>
        )}
      </Section>

      <Section title={t("sections.equipment")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("fields.brand")}>
            <Combobox
              value={props.brandFilter}
              onChange={(v) => props.setBrandFilter(v as string | null)}
              options={props.brands.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={t("fields.brandPlaceholder")}
              searchable
            />
          </Field>
          <Field label={t("fields.category")}>
            <Combobox
              value={props.categoryFilter}
              onChange={(v) => props.setCategoryFilter(v as string | null)}
              options={props.categories.map((c) => ({
                value: c.id,
                label: c.nameKo ?? c.nameEn ?? c.nameVi ?? c.id,
              }))}
              placeholder={t("fields.categoryPlaceholder")}
              searchable
            />
          </Field>
        </div>
        <Field label={t("fields.model")}>
          <Combobox
            value={props.modelId}
            onChange={(v) => props.setModelId(v as string | null)}
            options={props.models.map((m) => {
              const name = m.nameKo ?? m.nameEn ?? m.nameVi ?? m.modelCode ?? m.id;
              // Add brand + category context so search hits "Seoul Aqua AQ-500"
              // even when the operator only remembers one of those tokens.
              const brand = m.brand?.name;
              const cat = m.productCategory?.nameKo ?? m.productCategory?.nameEn ?? m.productCategory?.nameVi;
              const suffix = [brand, cat].filter(Boolean).join(" · ");
              return {
                value: m.id,
                label: suffix ? `${name} (${suffix})` : name,
              };
            })}
            placeholder={t("fields.modelPlaceholder")}
            searchable
          />
        </Field>
        <Field label={t("fields.serviceType")}>
          <div className="flex gap-3 text-sm">
            {(["RENTAL", "MAINTENANCE", "SALE"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="serviceType"
                  value={v}
                  checked={props.serviceType === v}
                  onChange={() => props.setServiceType(v)}
                />
                {t(`serviceTypes.${v}`)}
              </label>
            ))}
          </div>
        </Field>
        <Field label={t("fields.managementType")}>
          <Combobox
            value={props.managementType}
            onChange={(v) => props.setManagementType((v as ManagementType) ?? "FULL_SERVICE")}
            options={[
              { value: "FULL_SERVICE", label: t("managementTypes.FULL_SERVICE") },
              { value: "SELF_MANAGED", label: t("managementTypes.SELF_MANAGED") },
              { value: "OTHER", label: t("managementTypes.OTHER") },
            ]}
            searchable={false}
          />
        </Field>
      </Section>

      <Section title={t("sections.etc")}>
        <Field label={t("fields.installedAt")}>
          <DatePicker
            value={props.defaultInstalledAt}
            onChange={props.setDefaultInstalledAt}
          />
        </Field>
        <Field label={t("fields.technician")}>
          <Combobox
            value={props.installedByTechnicianId}
            onChange={(v) => props.setInstalledByTechnicianId(v as string | null)}
            options={props.techs.map((u) => ({ value: u.id, label: u.username }))}
            placeholder="—"
            searchable
          />
        </Field>
        <Field label={tc("notes")}>
          <Textarea
            value={props.installNotes}
            onChange={(e) => props.setInstallNotes(e.target.value)}
            rows={2}
          />
        </Field>
      </Section>

      <Section title={t("sections.contractCost")} highlight>
        <Field label={t("fields.deposit")}>
          <MoneyInput value={props.deposit} onChange={props.setDeposit} />
        </Field>
        <Field label={t("fields.monthlyFee")}>
          <MoneyInput value={props.monthlyFee} onChange={props.setMonthlyFee} />
        </Field>
        <p className="text-[11px] text-gray-500">{t("vatExclusive")}</p>
      </Section>
    </div>
  );
}

interface ListStepProps {
  t: (k: string) => string;
  tc: (k: string) => string;
  quantity: number;
  setQuantity: (n: number) => void;
  serialMode: SerialMode;
  setSerialMode: (m: SerialMode) => void;
  rows: RowState[];
  setRows: (r: RowState[]) => void;
  defaultInstalledAt: string;
  pasteText: string;
  setPasteText: (v: string) => void;
}

function ListStep(props: Readonly<ListStepProps>) {
  const { t, tc, quantity, setQuantity, serialMode, setSerialMode, rows, setRows, pasteText, setPasteText, defaultInstalledAt } = props;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Section title={t("sections.quantitySerial")}>
          <Field label={t("fields.quantity")}>
            <input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded-md border-2 border-gray-200 px-3 py-2 text-sm"
            />
          </Field>
          <Field label={t("fields.serialMode")}>
            <div className="grid grid-cols-2 gap-2">
              {(["auto", "manual", "excel", "paste"] as const).map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-center gap-1 rounded-md border-2 px-2 py-2 text-xs ${serialMode === m ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}
                >
                  <input
                    type="radio"
                    name="serialMode"
                    checked={serialMode === m}
                    onChange={() => setSerialMode(m)}
                  />
                  {t(`serialMode.${m}`)}
                </label>
              ))}
            </div>
          </Field>
          {serialMode === "paste" && (
            <Field label="Paste (serial,date 한 줄에 하나)">
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                placeholder="AQS-001,2026-05-01"
              />
              <Button
                variant="secondary"
                onClick={() =>
                  setRows(parsePaste(pasteText, quantity, defaultInstalledAt))
                }
              >
                {t("applyPaste")}
              </Button>
            </Field>
          )}
        </Section>
      </div>

      <div className="lg:col-span-2">
        <Section title={t("sections.rowsTable")}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-1.5">No.</th>
                  <th className="py-1.5">{t("fields.serialNumber")}</th>
                  <th className="py-1.5">{t("fields.assetCode")}</th>
                  <th className="py-1.5">{t("fields.installedAt")}</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="py-1.5 text-gray-500">{i + 1}</td>
                    <td className="py-1.5">
                      <Input
                        value={r.serialNumber}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, serialNumber: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td className="py-1.5">
                      <Input
                        value={r.assetCode}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, assetCode: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td className="py-1.5">
                      <div className="w-36">
                        <DatePicker
                          value={r.installedAt}
                          onChange={(v) => {
                            const next = [...rows];
                            next[i] = { ...r, installedAt: v };
                            setRows(next);
                          }}
                          clearable={false}
                        />
                      </div>
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        className="text-xs text-red-600"
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
      </div>
    </div>
  );
}

interface ConfirmStepProps {
  t: (k: string) => string;
  quantity: number;
  deposit: number | null;
  monthlyFee: number | null;
  rows: RowState[];
  serviceType: ServiceType;
  createContract: boolean;
  setCreateContract: (v: boolean) => void;
  contractTermMonths: number;
  setContractTermMonths: (v: number) => void;
}

function ConfirmStep({
  t,
  quantity,
  deposit,
  monthlyFee,
  rows,
  serviceType,
  createContract,
  setCreateContract,
  contractTermMonths,
  setContractTermMonths,
}: Readonly<ConfirmStepProps>) {
  const totalDeposit = (deposit ?? 0) * rows.length;
  const totalMonthly = (monthlyFee ?? 0) * rows.length;
  const showTerm = serviceType !== "SALE";
  let totalContractValue = 0;
  if (createContract) {
    if (serviceType === "SALE") {
      totalContractValue = totalMonthly;
    } else {
      totalContractValue = totalDeposit + totalMonthly * contractTermMonths;
    }
  }
  // Count rows per install date.
  const byDate: Record<string, number> = {};
  for (const r of rows) byDate[r.installedAt] = (byDate[r.installedAt] ?? 0) + 1;
  return (
    <div className="flex flex-col gap-4">
      <Section title={t("summary.title")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Stat label={t("summary.equipmentCount")} value={`${rows.length} / ${quantity}`} />
          <Stat
            label={t("summary.contractCount")}
            value={createContract ? "1" : "0"}
            hint={createContract ? undefined : t("summary.contractHint")}
          />
          <Stat
            label={t("summary.visitCount")}
            value={String(rows.length)}
            hint={Object.entries(byDate)
              .map(([d, n]) => `${d}: ${n}`)
              .join(" / ")}
          />
          <Stat label={t("summary.deposit")} value={formatMoney(totalDeposit)} />
          <Stat label={t("summary.monthlyFee")} value={formatMoney(totalMonthly)} />
        </div>
      </Section>

      <Section title={t("contract.title")}>
        <label className="flex items-start gap-2 text-sm">
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

        {createContract && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {showTerm && (
              <Field label={t("contract.termMonths")}>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={contractTermMonths}
                  onChange={(e) =>
                    setContractTermMonths(
                      Math.max(1, Math.min(120, Number(e.target.value) || 1)),
                    )
                  }
                  className="w-24 rounded-md border-2 border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
            )}
            <Stat
              label={t("contract.totalValue")}
              value={formatMoney(totalContractValue)}
              hint={
                showTerm
                  ? t("contract.totalValueHint").replace(
                      "{months}",
                      String(contractTermMonths),
                    )
                  : t("contract.totalValueHintSale")
              }
            />
            <Stat
              label={t("contract.numberPreview")}
              value={t("contract.autoAssigned")}
              hint={t("contract.numberPreviewHint")}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── Helpers ─────────────────────────

function buildRows(
  quantity: number,
  defaultDate: string,
  modelCode: string | null,
  mode: SerialMode,
): RowState[] {
  const arr: RowState[] = [];
  const prefix = modelCode ?? "AQS";
  const today = new Date(defaultDate);
  const yy = String(today.getFullYear()).slice(-2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  for (let i = 0; i < quantity; i++) {
    arr.push({
      id: `r${i}`,
      serialNumber: mode === "auto" ? `${prefix}${yy}${mm}${dd}${String(i + 1).padStart(4, "0")}` : "",
      assetCode: mode === "auto" ? `WA${yy}${mm}${dd}${String(i + 1).padStart(3, "0")}` : "",
      installedAt: defaultDate,
    });
  }
  return arr;
}

function parsePaste(
  text: string,
  fallbackQuantity: number,
  fallbackDate: string,
): RowState[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0)
    return Array.from({ length: fallbackQuantity }, (_, i) => ({
      id: `r${i}`,
      serialNumber: "",
      assetCode: "",
      installedAt: fallbackDate,
    }));
  return lines.map((line, i) => {
    const [serial, date] = line.split(",");
    return {
      id: `r${i}`,
      serialNumber: serial?.trim() ?? "",
      assetCode: "",
      installedAt: (date?.trim() ?? fallbackDate) || fallbackDate,
    };
  });
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}

function Section({
  title,
  children,
  highlight = false,
}: Readonly<{ title: string; children: React.ReactNode; highlight?: boolean }>) {
  return (
    <section
      className={`rounded-lg border-2 ${highlight ? "border-orange-300 bg-orange-50/40" : "border-gray-200 bg-white"} p-4`}
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function ReadOnlyValue({ value }: Readonly<{ value: string }>) {
  return (
    <div className="flex min-h-[2.25rem] items-center rounded-md border-2 border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      {value}
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
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
      className="rounded-md border-2 border-gray-200 px-3 py-2 text-sm"
    />
  );
}

function Stat({
  label,
  value,
  hint,
}: Readonly<{ label: string; value: React.ReactNode; hint?: string }>) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-gray-900">{value}</div>
      {hint && <div className="mt-1 text-[10px] text-gray-500">{hint}</div>}
    </div>
  );
}
