"use client";

/**
 * 4-step bulk equipment registration wizard (Task 2a.6) — 고객 → 장비 →
 * 판매방식 → 서비스구성. Replaces the earlier 3-step (info/list/confirm)
 * page; the excel/paste serial-entry modes and the per-row install-date
 * column are gone now that install date is a single batch-common field.
 *
 * Assembles the same components built across Phase 2a:
 *   - CustomerSearchSelect  (Step 1)
 *   - ModelPicker           (Step 2, plus quantity/date/technician/site/notes)
 *   - ServiceMethodSection  (Step 3)
 *   - ServiceConfigEditor   (Step 4)
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { FormField } from "@/components/ui/form-field";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { CustomerSearchSelect } from "@/components/equipment/customer-search-select";
import { ModelPicker } from "@/components/equipment/model-picker";
import {
  ServiceMethodSection,
  type ServiceMethodValue,
} from "@/components/equipment/service-method-section";
import {
  ServiceConfigEditor,
  type ServiceConfigValue,
} from "@/components/equipment/service-config-editor";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { formatVnd, formatDate } from "@/lib/format";
import { pickModelName } from "@/lib/products/name";

type WizardStep = "customer" | "equipment" | "method" | "service" | "confirm";
const STEPS: WizardStep[] = ["customer", "equipment", "method", "service", "confirm"];
type AssetCodeMode = "auto" | "manual";
type Loc = "ko" | "vi" | "en";

interface CustomerSite {
  id: string;
  name: string;
  addressWardName: string | null;
}

interface CustomerLite {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  sites: CustomerSite[];
}

interface TechnicianLite {
  id: string;
  username: string;
}

interface RowState {
  id: string;
  assetCode: string;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The wizard's asset-code ("관리번호") generator — unchanged from the
 *  previous 3-step page's `buildRows` helper. */
function buildAutoAssetCodes(quantity: number, dateYmd: string): string[] {
  const d = new Date(dateYmd);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return Array.from(
    { length: quantity },
    (_, i) => `WA${yy}${mm}${dd}${String(i + 1).padStart(3, "0")}`,
  );
}

function resizeRows(rows: RowState[], quantity: number): RowState[] {
  if (rows.length === quantity) return rows;
  if (rows.length > quantity) return rows.slice(0, quantity);
  const extra = Array.from({ length: quantity - rows.length }, (_, i) => ({
    id: `r${rows.length + i}-${Math.random().toString(36).slice(2, 7)}`,
    assetCode: "",
  }));
  return [...rows, ...extra];
}

function deriveCreateContract(v: ServiceMethodValue): boolean {
  if (v.method !== "SALE") return true; // RENTAL / MAINTENANCE always
  return !!v.hasContract || v.managementType === "FULL_SERVICE";
}

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
  const locale = useLocale() as Loc;
  const router = useRouter();
  const sp = useSearchParams();
  const api = useApi();

  const [step, setStep] = useState<WizardStep>("customer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Step 1: customer ───────────────────────────────────────────────
  const initialCustomerId = sp.get("customerId");
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [siteId, setSiteId] = useState<string | null>(null);

  const customerQuery = useApiQuery<CustomerLite>(
    customerId ? `/api/customers/${customerId}` : null,
  );
  const customer = customerQuery.data ?? null;
  const siteOptions = (customer?.sites ?? []).map((s) => ({
    value: s.id,
    label: [s.name, s.addressWardName].filter(Boolean).join(" · "),
  }));
  const noSitesForCustomer = !!customer && customer.sites.length === 0;

  // ─── Step 2: equipment ───────────────────────────────────────────────
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [defaultInstalledAt, setDefaultInstalledAt] = useState<string>(todayYmd());
  const [installedByTechnicianId, setInstalledByTechnicianId] = useState<string | null>(null);
  const [installNotes, setInstallNotes] = useState("");
  const [assetCodeMode, setAssetCodeMode] = useState<AssetCodeMode>("auto");
  const [rows, setRows] = useState<RowState[]>([]);

  const techsQuery = useApiQuery<TechnicianLite[]>("/api/users?role=TECHNICIAN&pageSize=100");
  const techs = techsQuery.data ?? [];

  // Regenerate the row list whenever quantity / date / mode changes. Auto
  // mode always rebuilds from scratch; manual mode preserves what the
  // operator already typed and only pads/truncates to match quantity.
  useEffect(() => {
    if (assetCodeMode === "manual") {
      setRows((prev) => resizeRows(prev, quantity));
      return;
    }
    setRows(
      buildAutoAssetCodes(quantity, defaultInstalledAt).map((code, i) => ({
        id: `r${i}`,
        assetCode: code,
      })),
    );
  }, [quantity, defaultInstalledAt, assetCodeMode]);

  // ─── Step 3: service method ──────────────────────────────────────────
  const [serviceMethod, setServiceMethod] = useState<ServiceMethodValue>({
    method: "RENTAL",
    contractNumber: "",
    contractDate: todayYmd(),
    termMonths: 36,
    deposit: 0,
    monthlyRent: 0,
  });

  // ─── Step 4: service config ──────────────────────────────────────────
  const [serviceConfig, setServiceConfig] = useState<ServiceConfigValue>({
    inspectionCycleDays: null,
    filters: [],
  });

  const inspectionDisabled =
    serviceMethod.method === "SALE" && serviceMethod.managementType === "SELF_MANAGED";

  // ─── Validation gates ────────────────────────────────────────────────
  const canGoEquipment = !!customerId;
  const canGoMethod = !!modelId;

  const stepperSteps: StepperStep[] = STEPS.map((s) => ({ key: s, label: t(`steps.${s}`) }));

  // ─── Submit ──────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!customerId || !modelId) return;
    setSubmitting(true);
    setError(null);
    try {
      const method = serviceMethod.method;
      const managementType =
        method === "SALE" ? (serviceMethod.managementType ?? "SELF_MANAGED") : "FULL_SERVICE";
      const createContract = deriveCreateContract(serviceMethod);
      const contractTermMonths =
        createContract && method !== "SALE" ? (serviceMethod.termMonths ?? 36) : undefined;

      const res = await api.post<{
        equipmentIds: string[];
        visitIds: string[];
        contractId: string | null;
        contractNumber: string | null;
      }>("/api/equipment/bulk-register", {
        customerId,
        siteId,
        modelId,
        rows: rows.map((r) => ({
          assetCode: r.assetCode || undefined,
          installedAt: defaultInstalledAt,
        })),
        defaultInstalledAt,
        installedByTechnicianId,
        installNotes: installNotes || undefined,
        createContract,
        serviceType: method,
        managementType,
        contractNumber: serviceMethod.contractNumber || undefined,
        contractDate: serviceMethod.contractDate || undefined,
        contractTermMonths,
        deposit: serviceMethod.deposit ?? undefined,
        monthlyRent: serviceMethod.monthlyRent ?? undefined,
        salePrice: serviceMethod.salePrice ?? undefined,
        installFee: serviceMethod.installFee ?? undefined,
        monthlyMaintenanceFee: serviceMethod.monthlyMaintenanceFee ?? undefined,
        hasContract: method === "SALE" ? !!serviceMethod.hasContract : undefined,
        serviceConfig: {
          inspectionCycleDays: serviceConfig.inspectionCycleDays ?? undefined,
          // Drop incomplete custom rows (addFilter() seeds customName:"" —
          // the server rejects a filter with neither a consumableId nor a
          // non-empty customName) rather than sending a row that 400s.
          filters: serviceConfig.filters
            .filter((f) => !!f.consumableId || !!f.customName?.trim())
            .map((f) => ({
              consumableId: f.consumableId,
              customName: f.customName,
              quantity: f.quantity,
              useCycleDays: f.useCycleDays,
            })),
        },
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

  const nextDisabled =
    (step === "customer" && !canGoEquipment) || (step === "equipment" && !canGoMethod);

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {step !== "customer" && (
            <Button
              variant="secondary"
              onClick={() => setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)])}
            >
              {t("prevStep")}
            </Button>
          )}
          {step !== "confirm" ? (
            <Button
              onClick={() => {
                if (nextDisabled) return;
                setStep(STEPS[STEPS.indexOf(step) + 1]);
              }}
              disabled={nextDisabled}
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

      <Stepper steps={stepperSteps} current={step} />

      {step === "customer" && (
        <CustomerSearchSelect
          value={customerId}
          onChange={(id) => {
            setCustomerId(id);
            setSiteId(null);
          }}
          locale={locale}
        />
      )}

      {step === "equipment" && (
        <EquipmentStep
          t={t}
          locale={locale}
          brandFilter={brandFilter}
          setBrandFilter={(v) => {
            setBrandFilter(v);
            // Brand change narrows the category list — drop a now
            // possibly-invalid category so the user re-picks.
            setCategoryFilter(null);
            setModelId(null);
          }}
          categoryFilter={categoryFilter}
          setCategoryFilter={(v) => {
            setCategoryFilter(v);
            setModelId(null);
          }}
          modelId={modelId}
          onModel={(v, meta) => {
            setModelId(v);
            // Selecting a model back-fills its brand + category.
            if (v) {
              setBrandFilter(meta?.brandId ?? null);
              setCategoryFilter(meta?.categoryId ?? null);
            }
            // Clear filters so ServiceConfigEditor re-seeds from the new
            // model's consumable catalog instead of showing stale rows.
            setServiceConfig((sc) => ({ ...sc, filters: [] }));
          }}
          quantity={quantity}
          setQuantity={setQuantity}
          defaultInstalledAt={defaultInstalledAt}
          setDefaultInstalledAt={setDefaultInstalledAt}
          installedByTechnicianId={installedByTechnicianId}
          setInstalledByTechnicianId={setInstalledByTechnicianId}
          techs={techs}
          assetCodeMode={assetCodeMode}
          setAssetCodeMode={setAssetCodeMode}
          rows={rows}
          setRows={setRows}
          siteId={siteId}
          setSiteId={setSiteId}
          siteOptions={siteOptions}
          noSitesForCustomer={noSitesForCustomer}
          installNotes={installNotes}
          setInstallNotes={setInstallNotes}
        />
      )}

      {step === "method" && (
        <ServiceMethodSection value={serviceMethod} onChange={setServiceMethod} />
      )}

      {step === "service" && (
        <ServiceConfigEditor
          modelId={modelId}
          installDate={defaultInstalledAt}
          inspectionDisabled={inspectionDisabled}
          value={serviceConfig}
          onChange={setServiceConfig}
        />
      )}

      {step === "confirm" && (
        <ConfirmStep
          t={t}
          locale={locale}
          customer={customer}
          siteId={siteId}
          siteOptions={siteOptions}
          modelId={modelId}
          quantity={quantity}
          installedAt={defaultInstalledAt}
          technician={techs.find((u) => u.id === installedByTechnicianId) ?? null}
          installNotes={installNotes}
          rows={rows}
          serviceMethod={serviceMethod}
          serviceConfig={serviceConfig}
        />
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}

// ───────────────────────── Step 2 ─────────────────────────

interface EquipmentStepProps {
  t: (k: string) => string;
  locale: Loc;
  brandFilter: string | null;
  setBrandFilter: (v: string | null) => void;
  categoryFilter: string | null;
  setCategoryFilter: (v: string | null) => void;
  modelId: string | null;
  onModel: (
    v: string | null,
    meta?: { brandId: string | null; categoryId: string | null },
  ) => void;
  quantity: number;
  setQuantity: (n: number) => void;
  defaultInstalledAt: string;
  setDefaultInstalledAt: (v: string) => void;
  installedByTechnicianId: string | null;
  setInstalledByTechnicianId: (v: string | null) => void;
  techs: TechnicianLite[];
  assetCodeMode: AssetCodeMode;
  setAssetCodeMode: (m: AssetCodeMode) => void;
  rows: RowState[];
  setRows: (r: RowState[]) => void;
  siteId: string | null;
  setSiteId: (v: string | null) => void;
  siteOptions: { value: string; label: string }[];
  noSitesForCustomer: boolean;
  installNotes: string;
  setInstallNotes: (v: string) => void;
}

function EquipmentStep(props: Readonly<EquipmentStepProps>) {
  const { t } = props;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-lg border-2 border-gray-200 bg-white p-4">
        <ModelPicker
          brandFilter={props.brandFilter}
          categoryFilter={props.categoryFilter}
          modelId={props.modelId}
          onBrand={props.setBrandFilter}
          onCategory={props.setCategoryFilter}
          onModel={props.onModel}
          locale={props.locale}
        />
        <FormField label={t("fields.quantity")}>
          <NumberInput
            ariaLabel={t("fields.quantity")}
            value={props.quantity}
            onChange={props.setQuantity}
            min={1}
            max={500}
          />
        </FormField>
        <FormField label={t("fields.installedAt")}>
          <DatePicker
            ariaLabel={t("fields.installedAt")}
            value={props.defaultInstalledAt}
            onChange={props.setDefaultInstalledAt}
          />
        </FormField>
        <FormField label={t("fields.technician")}>
          <Combobox
            ariaLabel={t("fields.technician")}
            value={props.installedByTechnicianId}
            onChange={props.setInstalledByTechnicianId}
            options={props.techs.map((u) => ({ value: u.id, label: u.username }))}
            placeholder="—"
            searchable
          />
        </FormField>
        {!props.noSitesForCustomer && props.siteOptions.length > 0 && (
          <FormField label={t("fields.site")}>
            <Combobox
              ariaLabel={t("fields.site")}
              value={props.siteId}
              onChange={props.setSiteId}
              options={props.siteOptions}
              placeholder={t("fields.sitePlaceholder")}
              searchable
            />
          </FormField>
        )}
        <FormField label={tcNotes(t)}>
          <Textarea
            aria-label={tcNotes(t)}
            value={props.installNotes}
            onChange={(e) => props.setInstallNotes(e.target.value)}
            rows={2}
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border-2 border-gray-200 bg-white p-4">
        <FormField label={t("fields.assetCodeMode")}>
          <div className="grid grid-cols-2 gap-2">
            {(["auto", "manual"] as const).map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-1 rounded-md border-2 px-2 py-2 text-xs ${
                  props.assetCodeMode === m ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="assetCodeMode"
                  checked={props.assetCodeMode === m}
                  onChange={() => props.setAssetCodeMode(m)}
                />
                {t(`assetCodeModes.${m}`)}
              </label>
            ))}
          </div>
        </FormField>

        {props.assetCodeMode === "auto" ? (
          <div>
            <p className="mb-1 text-xs text-gray-500">{t("assetCodePreview")}</p>
            <div className="flex flex-wrap gap-1.5 rounded-md border-2 border-gray-100 bg-gray-50 p-2">
              {props.rows.map((r) => (
                <span
                  key={r.id}
                  className="rounded bg-white px-2 py-1 text-xs tabular-nums text-gray-700 ring-1 ring-gray-200"
                >
                  {r.assetCode}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border-2 border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-2 py-1.5">No.</th>
                  <th className="px-2 py-1.5">{t("fields.assetCode")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {props.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label={`${t("fields.assetCode")} ${i + 1}`}
                        value={r.assetCode}
                        onChange={(e) => {
                          const next = props.rows.map((row, j) =>
                            j === i ? { ...row, assetCode: e.target.value } : row,
                          );
                          props.setRows(next);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ponytail: "notes" already exists under the `common` namespace elsewhere
// in the app, but this component only receives the `bulkRegister` t()
// function — read the label from the same namespace instead of threading
// a second translator prop through just for one string.
function tcNotes(t: (k: string) => string): string {
  return t("fields.installNotes");
}

// ───────────────────────── Step 5: 최종 확인 ─────────────────────────

interface ModelNameLite {
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  modelCode: string | null;
}
interface ConsumableNameLite {
  consumableId: string;
  name: { ko: string | null; vi: string | null; en: string | null };
}

/** Contracts the wizard will mint — mirrors the API's `contractsToMint`
 *  (RENTAL/MAINTENANCE → 1; SALE → hasContract?1:0 + FULL_SERVICE?1:0). */
function expectedContractCount(v: ServiceMethodValue): number {
  if (v.method !== "SALE") return 1;
  return (v.hasContract ? 1 : 0) + (v.managementType === "FULL_SERVICE" ? 1 : 0);
}

interface ConfirmStepProps {
  t: (k: string, values?: Record<string, string | number>) => string;
  locale: Loc;
  customer: CustomerLite | null;
  siteId: string | null;
  siteOptions: { value: string; label: string }[];
  modelId: string | null;
  quantity: number;
  installedAt: string;
  technician: TechnicianLite | null;
  installNotes: string;
  rows: RowState[];
  serviceMethod: ServiceMethodValue;
  serviceConfig: ServiceConfigValue;
}

function ConfirmStep(props: Readonly<ConfirmStepProps>) {
  const { t, locale, customer, serviceMethod: m, serviceConfig: sc, quantity: qty } = props;

  const modelQuery = useApiQuery<ModelNameLite>(
    props.modelId ? `/api/equipment-models/${props.modelId}` : null,
  );
  const consumablesQuery = useApiQuery<ConsumableNameLite[]>(
    props.modelId ? `/api/equipment-models/${props.modelId}/consumables` : null,
  );
  const consumableName = (id?: string): string | null => {
    if (!id) return null;
    const c = consumablesQuery.data?.find((x) => x.consumableId === id);
    if (!c) return null;
    return c.name[locale] ?? c.name.vi ?? c.name.ko ?? c.name.en ?? id;
  };

  const none = t("confirm.none");
  const siteLabel = props.siteId
    ? (props.siteOptions.find((o) => o.value === props.siteId)?.label ?? none)
    : none;
  const modelName = modelQuery.data ? pickModelName(modelQuery.data, locale) : "…";
  const validFilters = sc.filters.filter((f) => !!f.consumableId || !!f.customName?.trim());

  const money = (n: number | null | undefined) =>
    n == null ? none : formatVnd(n);
  const total = (n: number | null | undefined) =>
    n == null ? none : formatVnd(n * qty);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">{t("confirm.hint")}</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Customer + site */}
        <Section title={t("confirm.sectionCustomer")}>
          <Row label={t("fields.customerName")} value={customer ? `${customer.name} (${customer.code})` : none} />
          <Row label={t("confirm.customerType")} value={customer?.type ?? none} />
          <Row label={t("fields.site")} value={siteLabel} />
        </Section>

        {/* Equipment */}
        <Section title={t("confirm.sectionEquipment")}>
          <Row label={t("fields.model")} value={modelName} />
          <Row label={t("fields.quantity")} value={String(qty)} />
          <Row label={t("fields.installedAt")} value={formatDate(props.installedAt, locale)} />
          <Row label={t("fields.technician")} value={props.technician?.username ?? none} />
          {props.installNotes.trim() && (
            <Row label={t("fields.installNotes")} value={props.installNotes} />
          )}
          <div>
            <p className="mb-1 text-xs text-gray-500">{t("confirm.assetCodes")}</p>
            <div className="flex flex-wrap gap-1.5">
              {props.rows.map((r) => (
                <span
                  key={r.id}
                  className="rounded bg-gray-50 px-2 py-1 text-xs tabular-nums text-gray-700 ring-1 ring-gray-200"
                >
                  {r.assetCode || none}
                </span>
              ))}
            </div>
          </div>
        </Section>

        {/* Method + contract */}
        <Section title={t("confirm.sectionMethod")}>
          <Row label={t("fields.serviceType")} value={t(`serviceTypes.${m.method}`)} />
          {m.method === "SALE" && m.managementType && (
            <Row label={t("confirm.management")} value={t(`managementTypes.${m.managementType}`)} />
          )}
          {m.method === "RENTAL" && (
            <>
              <Row label={t("fields.deposit")} value={money(m.deposit)} />
              <Row label={t("confirm.depositTotal")} value={total(m.deposit)} />
              <Row label={t("fields.monthlyFee")} value={money(m.monthlyRent)} />
              <Row label={t("confirm.monthlyTotal")} value={total(m.monthlyRent)} />
            </>
          )}
          {m.method === "MAINTENANCE" && (
            <>
              <Row label={t("confirm.monthlyMaintenanceFee")} value={money(m.monthlyMaintenanceFee)} />
              <Row label={t("confirm.monthlyTotal")} value={total(m.monthlyMaintenanceFee)} />
            </>
          )}
          {m.method === "SALE" && (
            <>
              <Row label={t("confirm.salePrice")} value={money(m.salePrice)} />
              <Row label={t("confirm.installFee")} value={money(m.installFee)} />
              <Row
                label={t("confirm.saleTotal")}
                value={total((m.salePrice ?? 0) + (m.installFee ?? 0))}
              />
              {m.managementType === "FULL_SERVICE" && (
                <Row label={t("confirm.monthlyMaintenanceFee")} value={money(m.monthlyMaintenanceFee)} />
              )}
            </>
          )}
          {m.method !== "SALE" && m.termMonths != null && (
            <Row label={t("confirm.termMonths")} value={t("confirm.months", { n: m.termMonths })} />
          )}
          {expectedContractCount(m) > 0 && (
            <>
              <Row
                label={t("confirm.contractNumber")}
                value={m.contractNumber?.trim() ? m.contractNumber : t("confirm.autoAssigned")}
              />
              {m.contractDate && (
                <Row label={t("confirm.contractDate")} value={formatDate(m.contractDate, locale)} />
              )}
            </>
          )}
          <Row label={t("confirm.contractCount")} value={String(expectedContractCount(m))} />
        </Section>

        {/* Service config */}
        <Section title={t("confirm.sectionService")}>
          <Row
            label={t("confirm.inspectionCycle")}
            value={
              sc.inspectionCycleDays != null
                ? t("confirm.days", { n: sc.inspectionCycleDays })
                : t("confirm.inspectionNone")
            }
          />
          <div>
            <p className="mb-1 text-xs text-gray-500">{t("confirm.filters")}</p>
            {validFilters.length === 0 ? (
              <p className="text-sm text-gray-400">{t("confirm.filtersNone")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {validFilters.map((f, i) => (
                  <li key={f.consumableId ?? `custom-${i}`} className="text-sm text-gray-700">
                    <span className="font-medium">
                      {consumableName(f.consumableId) ?? f.customName ?? none}
                    </span>
                    <span className="text-gray-500">
                      {" — "}
                      {t("confirm.filterLine", { qty: f.quantity, days: f.useCycleDays })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-[#002A4D]">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}
