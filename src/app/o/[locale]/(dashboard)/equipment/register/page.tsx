"use client";

/**
 * 4-step multi-line equipment registration wizard (Task 2b.2) — 고객 → 장비
 * → 판매방식 → 서비스구성. Replaces the earlier single-screen multi-line
 * table form.
 *
 * Structural difference from the sibling `bulk-register` wizard: `register`
 * bundles multiple model LINES into ONE contract (see
 * `pickContractType`/`registerEquipmentSchema` in
 * `src/app/api/equipment/register/route.ts`). So:
 *   - Step 1 (customer) and the batch-common part of Step 2 (install date /
 *     technician / site / notes) are collected once, same as bulk-register.
 *   - Step 2's equipment picker is instead an ARRAY of lines (model +
 *     quantity + asset-code mode), each addable/removable.
 *   - Step 3 collects the bundled contract's number/date/term ONCE at the
 *     top, then a per-line `ServiceMethodSection hideContractFields`
 *     accordion (method + pricing + management type only).
 *   - Step 4 is a per-line `ServiceConfigEditor` accordion.
 */

import { Suspense, useMemo, useState } from "react";
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
import { useApiPageQuery, useApiQuery } from "@/lib/api/hooks";
import { pickModelName } from "@/lib/products/name";

type WizardStep = "customer" | "equipment" | "method" | "service";
const STEPS: WizardStep[] = ["customer", "equipment", "method", "service"];
type SerialMode = "auto" | "manual";

interface CustomerSite {
  id: string;
  name: string;
  addressWardName: string | null;
}

interface CustomerLite {
  id: string;
  sites: CustomerSite[];
}

interface TechnicianLite {
  id: string;
  username: string;
}

interface ModelLite {
  id: string;
  modelCode: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
}

interface LineState {
  id: string;
  brandFilter: string | null;
  categoryFilter: string | null;
  modelId: string | null;
  quantity: number;
  serialMode: SerialMode;
  serialPrefix: string;
  serviceMethod: ServiceMethodValue;
  serviceConfig: ServiceConfigValue;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newLine(): LineState {
  return {
    id: `l-${Math.random().toString(36).slice(2, 9)}`,
    brandFilter: null,
    categoryFilter: null,
    modelId: null,
    quantity: 1,
    serialMode: "auto",
    serialPrefix: "",
    serviceMethod: { method: "RENTAL", contractDate: todayYmd(), deposit: 0, monthlyRent: 0 },
    serviceConfig: { inspectionCycleDays: null, filters: [] },
  };
}

// ponytail: mirrors bulk-register/page.tsx's identical predicate — a
// 4-line pure fn isn't worth extracting into a shared lib for two callers.
function deriveCreateContract(v: ServiceMethodValue): boolean {
  if (v.method !== "SALE") return true; // RENTAL / MAINTENANCE always
  return !!v.hasContract || v.managementType === "FULL_SERVICE";
}

/** monthlyFee is rent/maintenance only — SALE carries its price in salePrice/installFee instead. */
function pickMonthlyFee(v: ServiceMethodValue): number | undefined {
  if (v.method === "RENTAL") return v.monthlyRent ?? undefined;
  if (v.method === "MAINTENANCE") return v.monthlyMaintenanceFee ?? undefined;
  return undefined;
}

export default function RegisterEquipmentPage() {
  return (
    <Suspense fallback={null}>
      <RegisterEquipmentInner />
    </Suspense>
  );
}

function RegisterEquipmentInner() {
  const t = useTranslations("equipment.register");
  const tb = useTranslations("equipment.bulkRegister");
  const tm = useTranslations("equipment.serviceMethod");
  const tc = useTranslations("common");
  const locale = useLocale() as "ko" | "vi" | "en";
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

  // ─── Step 2: lines + batch-common install info ───────────────────────
  const [defaultInstalledAt, setDefaultInstalledAt] = useState(todayYmd());
  const [installedByTechnicianId, setInstalledByTechnicianId] = useState<string | null>(null);
  const [installNotes, setInstallNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([newLine()]);

  const techsQuery = useApiQuery<TechnicianLite[]>("/api/users?role=TECHNICIAN&pageSize=100");
  const techs = techsQuery.data ?? [];

  // Unfiltered model catalog — used only to resolve Step 3/4 accordion
  // titles (each line's own ModelPicker keeps its own brand/category-
  // filtered query independently).
  const allModelsQuery = useApiPageQuery<ModelLite[]>(
    "/api/equipment-models?isActive=true&pageSize=200",
  );
  const modelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allModelsQuery.data?.data ?? []) {
      map.set(m.id, pickModelName(m, locale));
    }
    return map;
  }, [allModelsQuery.data, locale]);

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }
  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  // ─── Step 3: bundled contract info (once) ────────────────────────────
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState(todayYmd());
  const [contractTermMonths, setContractTermMonths] = useState(36);

  // ─── Validation gates ────────────────────────────────────────────────
  const completedLines = lines.filter((l): l is LineState & { modelId: string } => !!l.modelId);
  const canGoEquipment = !!customerId;
  const canGoMethod = completedLines.length > 0;

  const stepperSteps: StepperStep[] = STEPS.map((s) => ({ key: s, label: tb(`steps.${s}`) }));

  // ─── Submit ──────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!customerId || completedLines.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const createContract = completedLines.some((l) => deriveCreateContract(l.serviceMethod));
      const hasNonSaleLine = completedLines.some((l) => l.serviceMethod.method !== "SALE");

      const res = await api.post<{
        equipmentIds: string[];
        visitIds: string[];
        contractId: string | null;
        contractNumber: string | null;
      }>("/api/equipment/register", {
        customerId,
        siteId,
        defaultInstalledAt,
        installedByTechnicianId,
        installNotes: installNotes || undefined,
        contractNumber: contractNumber || undefined,
        contractDate: contractDate || undefined,
        createContract,
        contractTermMonths: createContract && hasNonSaleLine ? contractTermMonths : undefined,
        lines: completedLines.map((l) => {
          const method = l.serviceMethod.method;
          const managementType =
            method === "SALE" ? (l.serviceMethod.managementType ?? "SELF_MANAGED") : "FULL_SERVICE";
          return {
            modelId: l.modelId,
            serviceType: method,
            managementType,
            quantity: l.quantity,
            deposit: l.serviceMethod.deposit ?? undefined,
            monthlyFee: pickMonthlyFee(l.serviceMethod),
            salePrice: l.serviceMethod.salePrice ?? undefined,
            installFee: l.serviceMethod.installFee ?? undefined,
            serialPrefix: l.serialMode === "manual" ? (l.serialPrefix || undefined) : undefined,
            serviceConfig: {
              inspectionCycleDays: l.serviceConfig.inspectionCycleDays ?? undefined,
              // Drop incomplete custom rows (addFilter() seeds customName:"" —
              // the server rejects a filter with neither a consumableId nor a
              // non-empty customName) rather than sending a row that 400s.
              filters: l.serviceConfig.filters
                .filter((f) => !!f.consumableId || !!f.customName?.trim())
                .map((f) => ({
                  consumableId: f.consumableId,
                  customName: f.customName,
                  quantity: f.quantity,
                  useCycleDays: f.useCycleDays,
                })),
            },
          };
        }),
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
              {tb("prevStep")}
            </Button>
          )}
          {step !== "service" ? (
            <Button
              onClick={() => {
                if (nextDisabled) return;
                setStep(STEPS[STEPS.indexOf(step) + 1]);
              }}
              disabled={nextDisabled}
            >
              {tb("nextStep")}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || completedLines.length === 0}>
              {submitting ? tc("saving") : tb("submitFinal")}
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
          tb={tb}
          locale={locale}
          lines={lines}
          updateLine={updateLine}
          removeLine={removeLine}
          addLine={addLine}
          defaultInstalledAt={defaultInstalledAt}
          setDefaultInstalledAt={setDefaultInstalledAt}
          installedByTechnicianId={installedByTechnicianId}
          setInstalledByTechnicianId={setInstalledByTechnicianId}
          techs={techs}
          siteId={siteId}
          setSiteId={setSiteId}
          siteOptions={siteOptions}
          noSitesForCustomer={noSitesForCustomer}
          installNotes={installNotes}
          setInstallNotes={setInstallNotes}
        />
      )}

      {step === "method" && (
        <MethodStep
          t={t}
          tm={tm}
          contractNumber={contractNumber}
          setContractNumber={setContractNumber}
          contractDate={contractDate}
          setContractDate={setContractDate}
          contractTermMonths={contractTermMonths}
          setContractTermMonths={setContractTermMonths}
          completedLines={completedLines}
          updateLine={updateLine}
          modelNameById={modelNameById}
        />
      )}

      {step === "service" && (
        <ServiceStep
          t={t}
          completedLines={completedLines}
          updateLine={updateLine}
          modelNameById={modelNameById}
          installDate={defaultInstalledAt}
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
  t: (k: string, values?: Record<string, string | number | Date>) => string;
  tb: (k: string) => string;
  locale: "ko" | "vi" | "en";
  lines: LineState[];
  updateLine: (id: string, patch: Partial<LineState>) => void;
  removeLine: (id: string) => void;
  addLine: () => void;
  defaultInstalledAt: string;
  setDefaultInstalledAt: (v: string) => void;
  installedByTechnicianId: string | null;
  setInstalledByTechnicianId: (v: string | null) => void;
  techs: TechnicianLite[];
  siteId: string | null;
  setSiteId: (v: string | null) => void;
  siteOptions: { value: string; label: string }[];
  noSitesForCustomer: boolean;
  installNotes: string;
  setInstallNotes: (v: string) => void;
}

function EquipmentStep(props: Readonly<EquipmentStepProps>) {
  const { t, tb } = props;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 rounded-lg border-2 border-gray-200 bg-white p-4 sm:grid-cols-2">
        <FormField label={tb("fields.installedAt")}>
          <DatePicker
            ariaLabel={tb("fields.installedAt")}
            value={props.defaultInstalledAt}
            onChange={props.setDefaultInstalledAt}
          />
        </FormField>
        <FormField label={tb("fields.technician")}>
          <Combobox
            ariaLabel={tb("fields.technician")}
            value={props.installedByTechnicianId}
            onChange={props.setInstalledByTechnicianId}
            options={props.techs.map((u) => ({ value: u.id, label: u.username }))}
            placeholder="—"
            searchable
          />
        </FormField>
        {!props.noSitesForCustomer && props.siteOptions.length > 0 && (
          <FormField label={tb("fields.site")}>
            <Combobox
              ariaLabel={tb("fields.site")}
              value={props.siteId}
              onChange={props.setSiteId}
              options={props.siteOptions}
              placeholder={tb("fields.sitePlaceholder")}
              searchable
            />
          </FormField>
        )}
        <FormField label={tb("fields.installNotes")} className="sm:col-span-2">
          <Textarea
            aria-label={tb("fields.installNotes")}
            value={props.installNotes}
            onChange={(e) => props.setInstallNotes(e.target.value)}
            rows={2}
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-3">
        {props.lines.map((line, i) => (
          <div key={line.id} className="rounded-lg border-2 border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                {t("lineLabel", { n: i + 1 })}
              </span>
              <button
                type="button"
                onClick={() => props.removeLine(line.id)}
                disabled={props.lines.length === 1}
                className="text-xs text-red-600 disabled:text-gray-300"
              >
                {t("actions.removeLine")}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <ModelPicker
                  brandFilter={line.brandFilter}
                  categoryFilter={line.categoryFilter}
                  modelId={line.modelId}
                  onBrand={(v) =>
                    props.updateLine(line.id, {
                      brandFilter: v,
                      // Brand change narrows the category list — drop a now
                      // possibly-invalid category so the user re-picks.
                      categoryFilter: null,
                      modelId: null,
                      serviceConfig: { ...line.serviceConfig, filters: [] },
                    })
                  }
                  onCategory={(v) =>
                    props.updateLine(line.id, {
                      categoryFilter: v,
                      modelId: null,
                      serviceConfig: { ...line.serviceConfig, filters: [] },
                    })
                  }
                  onModel={(v, meta) =>
                    props.updateLine(line.id, {
                      modelId: v,
                      // Selecting a model back-fills its brand + category.
                      ...(v
                        ? {
                            brandFilter: meta?.brandId ?? null,
                            categoryFilter: meta?.categoryId ?? null,
                          }
                        : {}),
                      serviceConfig: { ...line.serviceConfig, filters: [] },
                    })
                  }
                  locale={props.locale}
                />
              </div>
              <FormField label={tb("fields.quantity")}>
                <NumberInput
                  ariaLabel={tb("fields.quantity")}
                  value={line.quantity}
                  onChange={(v) => props.updateLine(line.id, { quantity: v })}
                  min={1}
                  max={500}
                />
              </FormField>
              <FormField label={tb("fields.serialMode")}>
                <div className="grid grid-cols-2 gap-2">
                  {(["auto", "manual"] as const).map((m) => (
                    <label
                      key={m}
                      className={`flex cursor-pointer items-center gap-1 rounded-md border-2 px-2 py-2 text-xs ${
                        line.serialMode === m
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`serialMode-${line.id}`}
                        checked={line.serialMode === m}
                        onChange={() => props.updateLine(line.id, { serialMode: m })}
                      />
                      {tb(`assetCodeModes.${m}`)}
                    </label>
                  ))}
                </div>
              </FormField>
              {line.serialMode === "manual" && (
                <FormField label={t("fields.serialPrefix")}>
                  <Input
                    aria-label={t("fields.serialPrefix")}
                    value={line.serialPrefix}
                    onChange={(e) => props.updateLine(line.id, { serialPrefix: e.target.value })}
                    placeholder={t("fields.serialPrefixPlaceholder")}
                  />
                </FormField>
              )}
            </div>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={props.addLine} className="self-start">
          {t("actions.addLine")}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── Step 3 ─────────────────────────

interface MethodStepProps {
  t: (k: string, values?: Record<string, string | number | Date>) => string;
  tm: (k: string) => string;
  contractNumber: string;
  setContractNumber: (v: string) => void;
  contractDate: string;
  setContractDate: (v: string) => void;
  contractTermMonths: number;
  setContractTermMonths: (v: number) => void;
  completedLines: (LineState & { modelId: string })[];
  updateLine: (id: string, patch: Partial<LineState>) => void;
  modelNameById: Map<string, string>;
}

function MethodStep(props: Readonly<MethodStepProps>) {
  const { t, tm } = props;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border-4 border-[var(--brand-blue-100)] bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-[#002A4D]">{t("contractInfo.title")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label={tm("contractNumber")}>
            <Input
              aria-label={tm("contractNumber")}
              value={props.contractNumber}
              onChange={(e) => props.setContractNumber(e.target.value)}
            />
          </FormField>
          <FormField label={tm("contractDate")}>
            <DatePicker
              ariaLabel={tm("contractDate")}
              value={props.contractDate}
              onChange={props.setContractDate}
            />
          </FormField>
          <FormField label={tm("termMonths")}>
            <NumberInput
              ariaLabel={tm("termMonths")}
              value={props.contractTermMonths}
              onChange={props.setContractTermMonths}
              min={1}
              max={120}
            />
          </FormField>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {props.completedLines.map((line, i) => (
          <LineAccordion
            key={line.id}
            title={props.modelNameById.get(line.modelId) ?? t("lineLabel", { n: i + 1 })}
            defaultOpen={i === 0}
          >
            <ServiceMethodSection
              value={line.serviceMethod}
              onChange={(v) => props.updateLine(line.id, { serviceMethod: v })}
              hideContractFields
            />
          </LineAccordion>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Step 4 ─────────────────────────

interface ServiceStepProps {
  t: (k: string, values?: Record<string, string | number | Date>) => string;
  completedLines: (LineState & { modelId: string })[];
  updateLine: (id: string, patch: Partial<LineState>) => void;
  modelNameById: Map<string, string>;
  installDate: string;
}

function ServiceStep(props: Readonly<ServiceStepProps>) {
  const { t } = props;
  return (
    <div className="flex flex-col gap-3">
      {props.completedLines.map((line, i) => {
        const inspectionDisabled =
          line.serviceMethod.method === "SALE" &&
          (line.serviceMethod.managementType ?? "SELF_MANAGED") === "SELF_MANAGED";
        return (
          <LineAccordion
            key={line.id}
            title={props.modelNameById.get(line.modelId) ?? t("lineLabel", { n: i + 1 })}
            defaultOpen={i === 0}
          >
            <ServiceConfigEditor
              modelId={line.modelId}
              installDate={props.installDate}
              inspectionDisabled={inspectionDisabled}
              value={line.serviceConfig}
              onChange={(v) => props.updateLine(line.id, { serviceConfig: v })}
            />
          </LineAccordion>
        );
      })}
    </div>
  );
}

// ───────────────────────── shared ─────────────────────────

function LineAccordion({
  title,
  defaultOpen,
  children,
}: Readonly<{ title: string; defaultOpen?: boolean; children: React.ReactNode }>) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="rounded-2xl border-4 border-[var(--brand-blue-100)] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#002A4D]"
      >
        <span>{title}</span>
        <span className="text-xs text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t-2 border-[var(--brand-blue-100)] p-4">{children}</div>}
    </div>
  );
}
