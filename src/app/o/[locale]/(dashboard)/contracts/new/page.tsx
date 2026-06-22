"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations , useLocale} from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { pickEquipmentLabel } from "@/lib/products/name";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { ContractTypeBadge } from "@/components/contracts/contract-state-badge";
import { formatVnd } from "@/lib/format";

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  shortcode: string | null;
}

interface EquipmentOption {
  id: string;
  modelCode: string;
  modelName: string;
  serialNumber: string | null;
  siteId: string | null;
  site: { id: string; name: string } | null;
}

type ContractType = "SALE" | "RENTAL" | "MAINTENANCE";

/**
 * Two mutually-exclusive flavours of a contract equipment line:
 *
 * - `ExistingEquipmentLine` attaches a pre-installed Equipment row that
 *   the customer already owns (MAINTENANCE on an off-catalog bidet,
 *   for example). Mostly used as a fallback path now.
 * - `NewModelLine` registers brand-new equipment that the Contract API
 *   materialises on save — server picks `quantity` Equipment rows of
 *   `modelId`, optionally site-scoped, and generates sequential serials
 *   starting from `serialStart` (or the next value after the customer's
 *   last serial for the same model when `serialStart` is blank).
 */
type EquipmentLine = ExistingEquipmentLine | NewModelLine;

interface ExistingEquipmentLine {
  kind: "existing";
  equipmentId: string;
  unitPrice: number | null;
  quantity: number;
}

interface NewModelLine {
  kind: "new";
  /** Stable client-side key (modelId + siteId + tally) for React. */
  rowId: string;
  modelId: string;
  /** Required when customer.sites.length >= 2; otherwise null. */
  siteId: string | null;
  /** Blank = server picks "(last serial)+1" or "MODEL-000001". */
  serialStart: string;
  unitPrice: number | null;
  quantity: number;
}

export default function NewContractPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[#737373]">Loading…</div>}>
      <NewContractPageInner />
    </Suspense>
  );
}

function NewContractPageInner() {
  const locale = useLocale();
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();
  const sp = useSearchParams();
  const preselectCustomer = sp?.get("customerId") ?? null;

  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState<string | null>(preselectCustomer);
  const [type, setType] = useState<ContractType | null>(null);
  const [lines, setLines] = useState<EquipmentLine[]>([]);
  /**
   * Every contract type now derives its top-line money from the sum of
   * per-equipment line prices (`linesValueSum` below):
   *   - RENTAL / MAINTENANCE → Contract.monthlyMaintenanceFee
   *   - SALE                → Contract.totalContractValue
   * The dedicated `monthlyFee` + `totalValue` inputs at the top of step 3
   * are gone — office staff edits the per-line price directly in the
   * equipment table and the wizard shows the rolled-up total.
   */
  const [termMonths, setTermMonths] = useState<number>(36);
  // RENTAL-only — deposit collected at the installation visit and
  // refundable on early termination; endOfTermAction drives the rental-end
  // cron + retrieval auto-visit.
  const [deposit, setDeposit] = useState<number | null>(null);
  const [endOfTermAction, setEndOfTermAction] =
    useState<"TRANSFER_OWNERSHIP" | "RETRIEVE_DEVICE">("TRANSFER_OWNERSHIP");
  const [startDate, setStartDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);

  const customersQuery = useApiQuery<CustomerOption[]>(
    "/api/customers?pageSize=200&status=ACTIVE",
  );
  const customers = useMemo(
    () => customersQuery.data ?? [],
    [customersQuery.data],
  );
  const loadingCustomers = customersQuery.isLoading;

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  interface EquipmentApiRow {
    id: string;
    model: {
      id: string;
      modelCode: string | null;
      nameKo: string | null;
      nameVi: string | null;
      nameEn: string | null;
      brandId: string | null;
      brand: { id: string; name: string } | null;
      categoryId: string | null;
      productCategory: { id: string; nameKo: string | null; nameVi: string | null; nameEn: string | null } | null;
    } | null;
    customDescription: string | null;
    serialNumber: string | null;
    siteId: string | null;
    site: { id: string; name: string } | null;
    status: string;
  }
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const equipmentQuery = useApiQuery<EquipmentApiRow[]>(
    customerId
      ? `/api/equipment?customerId=${customerId}&pageSize=500`
      : null,
  );

  // Full catalog — every active EquipmentModel, regardless of whether
  // this customer already owns one. Step 2 picks from the full catalog
  // so a contract can install brand-new units (the workflow materialises
  // them on submit).
  interface CatalogModel {
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
      nameKo: string | null;
      nameVi: string | null;
      nameEn: string | null;
    } | null;
    monthlyRentalPrice: string | null;
    retailPrice: string | null;
  }
  const catalogQuery = useApiQuery<CatalogModel[]>(
    "/api/equipment-models?pageSize=500&isActive=true",
  );
  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);

  // Customer sites (B2B) — drives the per-row site picker when there
  // are ≥2 sites; also feeds the existing AddEquipmentQuickModal.
  interface SiteOpt { id: string; name: string }
  const sitesQuery = useApiQuery<SiteOpt[]>(
    customer?.type === "B2B" ? `/api/customers/${customerId}/sites` : null,
  );
  const customerSites = sitesQuery.data ?? [];
  const requireSiteOnLine = customerSites.length >= 2;
  // Brand + category options derived from the loaded rows so the
  // dropdowns only ever show values that actually filter to something.
  // Both are sorted by display label so the order stays stable across
  // re-renders.
  // Filters derive from the FULL catalog so brand/category dropdowns
  // surface every option even when the customer doesn't own a model
  // of that kind yet.
  function localizedCategoryName(pc: {
    id: string;
    nameKo: string | null;
    nameVi: string | null;
    nameEn: string | null;
  }): string {
    if (locale === "ko") return pc.nameKo ?? pc.nameVi ?? pc.nameEn ?? pc.id;
    if (locale === "en") return pc.nameEn ?? pc.nameVi ?? pc.nameKo ?? pc.id;
    return pc.nameVi ?? pc.nameKo ?? pc.nameEn ?? pc.id;
  }
  const brandOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const cm of catalog) {
      if (cm.brand) m.set(cm.brand.id, cm.brand.name);
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog]);
  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const cm of catalog) {
      const pc = cm.productCategory;
      if (pc) m.set(pc.id, localizedCategoryName(pc));
    }
    return Array.from(m.entries())
      .map(([id, label]) => ({ value: id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog, locale]);
  const equipment = useMemo<EquipmentOption[]>(
    () =>
      (equipmentQuery.data ?? [])
        .filter((e) => (brandFilter ? e.model?.brandId === brandFilter : true))
        .filter((e) =>
          categoryFilter ? e.model?.categoryId === categoryFilter : true,
        )
        .map((e) => ({
          id: e.id,
          modelCode: e.model?.modelCode ?? "EXT",
          modelName: pickEquipmentLabel(e, locale),
          serialNumber: e.serialNumber,
          siteId: e.siteId,
          site: e.site,
        })),
    [equipmentQuery.data, brandFilter, categoryFilter, locale],
  );
  const loadingEquipment = equipmentQuery.isLoading;
  const loadEquipment = async () => {
    await equipmentQuery.refetch();
  };

  function addLine(equipmentId: string) {
    setLines((prev) =>
      prev.some((l) => l.kind === "existing" && l.equipmentId === equipmentId)
        ? prev
        : [...prev, { kind: "existing", equipmentId, unitPrice: null, quantity: 1 }],
    );
  }

  function removeLine(equipmentId: string) {
    setLines((prev) =>
      prev.filter((l) => !(l.kind === "existing" && l.equipmentId === equipmentId)),
    );
  }

  function updateExistingLine(equipmentId: string, patch: Partial<ExistingEquipmentLine>) {
    setLines((prev) =>
      prev.map((l) =>
        l.kind === "existing" && l.equipmentId === equipmentId ? { ...l, ...patch } : l,
      ),
    );
  }

  // Add a brand-new modelId line. Picker default: empty siteId — the
  // user fills in per-row site if the customer has ≥2 sites.
  function addModelLine(modelId: string) {
    setLines((prev) => [
      ...prev,
      {
        kind: "new",
        rowId: `${modelId}-${prev.length + 1}-${Date.now().toString(36).slice(-4)}`,
        modelId,
        siteId: null,
        serialStart: "",
        unitPrice: null,
        quantity: 1,
      },
    ]);
  }

  function removeNewLine(rowId: string) {
    setLines((prev) =>
      prev.filter((l) => !(l.kind === "new" && l.rowId === rowId)),
    );
  }

  function updateNewLine(rowId: string, patch: Partial<NewModelLine>) {
    setLines((prev) =>
      prev.map((l) =>
        l.kind === "new" && l.rowId === rowId ? { ...l, ...patch } : l,
      ),
    );
  }

  // Rolled-up money for every contract type. RENTAL / MAINTENANCE feed
  // this into Contract.monthlyMaintenanceFee, SALE feeds it into
  // Contract.totalContractValue. Always recomputed from `lines` so the
  // wizard never carries stale state.
  const linesValueSum = lines.reduce(
    (acc, l) => acc + (l.unitPrice ?? 0) * l.quantity,
    0,
  );

  function next() {
    setError(null);
    if (step === 1 && !customerId) {
      setError(t("wizard.pickCustomer"));
      return;
    }
    if (step === 2) {
      if (!type) {
        setError(t("wizard.pickType"));
        return;
      }
      if (lines.length === 0) {
        setError(t("validation.atLeastOneEquipment"));
        return;
      }
      // Multi-site B2B: every NEW model line must specify a site.
      if (requireSiteOnLine) {
        const missing = lines.some((l) => l.kind === "new" && !l.siteId);
        if (missing) {
          setError(t("wizard.siteRequiredNotice", { count: customerSites.length }));
          return;
        }
      }
    }
    setStep((s) => Math.min(4, s + 1));
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        customerId,
        type,
        equipment: lines.map((l) =>
          l.kind === "existing"
            ? {
                equipmentId: l.equipmentId,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
              }
            : {
                modelId: l.modelId,
                siteId: l.siteId || undefined,
                serialStart: l.serialStart.trim() || undefined,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
              },
        ),
        notes: notes.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
      };
      if (type === "RENTAL") {
        payload.termMonths = termMonths;
        payload.monthlyMaintenanceFee = linesValueSum;
        payload.deposit = deposit;
        payload.endOfTermAction = endOfTermAction;
      } else if (type === "MAINTENANCE") {
        payload.monthlyMaintenanceFee = linesValueSum;
      } else {
        payload.totalContractValue = linesValueSum;
      }
      const res = await api.post<{ id: string; contractNumber: string }>(
        "/api/contracts",
        payload,
      );
      router.push(`/o/contracts/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("createContract")}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#737373]">
          <StepDot label={t("wizard.step1")} active={step === 1} done={step > 1} />
          <StepDot label={t("wizard.step2")} active={step === 2} done={step > 2} />
          <StepDot label={t("wizard.step3")} active={step === 3} done={step > 3} />
          <StepDot label={t("wizard.step4")} active={step === 4} done={false} />
        </div>
      </header>

      {step === 1 && (
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-4">
          <FormField label={t("wizard.pickCustomer")} required>
            <div className="flex gap-2">
              <div className="flex-1">
                <Combobox
                  value={customerId}
                  onChange={(v) => {
                    setCustomerId(v);
                    setLines([]);
                  }}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.code} — ${c.name}`,
                    description: c.type === "B2B" ? `B2B · ${c.shortcode ?? "—"}` : "B2C",
                  }))}
                  placeholder={loadingCustomers ? tc("loading") : t("wizard.pickCustomer")}
                  ariaLabel={t("wizard.pickCustomer")}
                />
              </div>
              <Button variant="secondary" onClick={() => setShowNewCustomer(true)}>
                + {t("wizard.newCustomer")}
              </Button>
            </div>
          </FormField>
        </section>
      )}

      {showNewCustomer && (
        <NewCustomerQuickModal
          onClose={() => setShowNewCustomer(false)}
          onCreated={async (created) => {
            // Await refetch so `customers` includes the new row BEFORE we
            // select it — otherwise `customer = customers.find(...)`
            // returns null and Step 2 (equipment picker) silently shows
            // "no customer" until the in-flight refetch resolves.
            await customersQuery.refetch();
            setCustomerId(created.id);
            setLines([]);
            setShowNewCustomer(false);
          }}
        />
      )}

      {showAddEquipment && customer && (
        <AddEquipmentQuickModal
          customerId={customer.id}
          customerType={customer.type}
          onClose={() => setShowAddEquipment(false)}
          onCreated={async (createdEquipmentId) => {
            setShowAddEquipment(false);
            // Refresh the equipment list, auto-pick the new row as a contract
            // line so the user doesn't lose context.
            await loadEquipment();
            addLine(createdEquipmentId);
          }}
        />
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-4">
          <FormField label={t("wizard.pickType")} required>
            <Combobox
              value={type}
              onChange={(v) => setType(v as ContractType | null)}
              options={[
                { value: "SALE", label: t("types.SALE") },
                { value: "RENTAL", label: t("types.RENTAL") },
                { value: "MAINTENANCE", label: t("types.MAINTENANCE") },
              ]}
              searchable={false}
              allowClear={false}
              placeholder={t("wizard.pickType")}
            />
          </FormField>

          {/* Brand / category filters (apply to BOTH the catalog picker and
              the existing-equipment list below). */}
          {(brandOptions.length > 0 || categoryOptions.length > 0) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {brandOptions.length > 0 && (
                <Combobox
                  value={brandFilter}
                  onChange={setBrandFilter}
                  options={brandOptions}
                  placeholder={t("wizard.filterBrand")}
                  allowClear
                  searchable={brandOptions.length > 5}
                />
              )}
              {categoryOptions.length > 0 && (
                <Combobox
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={categoryOptions}
                  placeholder={t("wizard.filterCategory")}
                  allowClear
                  searchable={categoryOptions.length > 5}
                />
              )}
            </div>
          )}

          {/* Multi-site B2B notice — every NEW model line must specify
              which site the device is being installed at. */}
          {requireSiteOnLine && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("wizard.siteRequiredNotice", { count: customerSites.length })}
            </div>
          )}

          {/* Catalog picker — add a brand-new modelId line. Server
              materialises Equipment rows on submit. */}
          <FormField label={t("wizard.pickModel")}>
            <Combobox
              value={null}
              onChange={(v) => v && addModelLine(v)}
              options={catalog
                .filter((cm) =>
                  brandFilter ? cm.brandId === brandFilter : true,
                )
                .filter((cm) =>
                  categoryFilter ? cm.categoryId === categoryFilter : true,
                )
                .map((cm) => ({
                  value: cm.id,
                  label: `${cm.modelCode ?? ""} — ${pickEquipmentLabel({ model: cm }, locale)}`,
                  description: cm.brand?.name ?? "",
                }))}
              placeholder={t("wizard.pickModelPlaceholder")}
              searchable
            />
          </FormField>

          {/* New model lines list. Each row gets quantity + (site when
              multi-site) + optional starting serial (server picks
              "(last serial)+1" when blank). */}
          {lines.some((l) => l.kind === "new") && (
            <div className="flex flex-col gap-2">
              {lines
                .filter((l): l is NewModelLine => l.kind === "new")
                .map((l) => {
                  const cm = catalog.find((c) => c.id === l.modelId);
                  return (
                    <div
                      key={l.rowId}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 sm:grid-cols-[1fr_80px_140px_180px_auto]"
                    >
                      <div className="flex flex-col text-sm">
                        <span className="font-medium">
                          {cm?.modelCode} — {pickEquipmentLabel({ model: cm ?? null }, locale)}
                        </span>
                        <span className="text-xs text-[#737373]">
                          {cm?.brand?.name ?? ""}
                        </span>
                      </div>
                      <NumberInput
                        value={l.quantity}
                        onChange={(v) => updateNewLine(l.rowId, { quantity: v ?? 1 })}
                        min={1}
                        max={500}
                      />
                      {requireSiteOnLine ? (
                        <Combobox
                          value={l.siteId}
                          onChange={(v) => updateNewLine(l.rowId, { siteId: v })}
                          options={customerSites.map((s) => ({
                            value: s.id,
                            label: s.name,
                          }))}
                          placeholder={t("wizard.pickSite")}
                          searchable={customerSites.length > 5}
                        />
                      ) : (
                        <div />
                      )}
                      <Input
                        value={l.serialStart}
                        onChange={(e) =>
                          updateNewLine(l.rowId, { serialStart: e.target.value })
                        }
                        placeholder={t("wizard.serialStartAuto")}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeNewLine(l.rowId)}
                      >
                        {t("wizard.removeLine")}
                      </Button>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Existing equipment list — pick already-installed units to
              attach (MAINTENANCE on customer-owned bidet, etc.). */}
          {equipment.length > 0 && (
            <FormField label={t("wizard.pickExistingEquipment")}>
              <div className="flex flex-col gap-2">
                {loadingEquipment && (
                  <p className="text-xs text-[#737373]">{tc("loading")}</p>
                )}
                {equipment.map((e) => {
                  const picked = lines.find(
                    (l) => l.kind === "existing" && l.equipmentId === e.id,
                  );
                  return (
                    <label
                      key={e.id}
                      className="flex items-center gap-3 rounded-lg border border-[#e5e5e5] p-2 hover:bg-[#fafafa]"
                    >
                      <input
                        type="checkbox"
                        checked={!!picked}
                        onChange={(ev) => {
                          if (ev.target.checked) addLine(e.id);
                          else removeLine(e.id);
                        }}
                      />
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm">
                          {e.modelCode} — {e.modelName}
                        </span>
                        <span className="text-xs text-[#737373]">
                          {e.serialNumber ? `Serial: ${e.serialNumber}` : "—"}
                          {e.site?.name ? ` · ${e.site.name}` : ""}
                        </span>
                      </div>
                    </label>
                  );
                })}
                {customer && (
                  <button
                    type="button"
                    onClick={() => setShowAddEquipment(true)}
                    className="self-start text-xs text-[var(--brand-blue-700)] underline"
                  >
                    + {t("wizard.addLine")}
                  </button>
                )}
              </div>
            </FormField>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-4">
          {type === "RENTAL" && (
            <>
              {/* For RENTAL the per-equipment monthly maintenance fee is
                  entered in the table below as `unitPrice`; the total
                  monthly fee is derived from the sum of all lines. The
                  contract-level monthly-fee input has therefore been
                  removed for RENTAL. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("termMonths")} required>
                  <NumberInput value={termMonths} onChange={setTermMonths} min={1} max={120} />
                </FormField>
                <FormField label={t("deposit")} required hint={t("wizard.depositHint")}>
                  <NumberInput value={deposit ?? 0} onChange={(v) => setDeposit(v)} min={0} />
                </FormField>
              </div>
              <FormField label={t("endOfTermAction")} required>
                <div className="flex flex-col gap-2">
                  {(["TRANSFER_OWNERSHIP", "RETRIEVE_DEVICE"] as const).map((value) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                        endOfTermAction === value
                          ? "border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)]"
                          : "border-[#e5e5e5] bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="endOfTermAction"
                        value={value}
                        checked={endOfTermAction === value}
                        onChange={() => setEndOfTermAction(value)}
                        className="mt-1"
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-[#111111]">
                          {t(`endOfTermActions.${value}` as never)}
                        </span>
                        <span className="text-xs text-[#737373]">
                          {t(`wizard.endOfTermHint.${value}` as never)}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </FormField>
            </>
          )}
          {type === "MAINTENANCE" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Monthly fee is derived from sum(관리비 × 수량) of the
                  per-equipment lines; office staff edits the per-line
                  관리비 directly in the equipment table below. */}
              <FormField label={t("termMonths")}>
                <NumberInput value={termMonths} onChange={setTermMonths} min={1} max={120} />
              </FormField>
            </div>
          )}
          {/* SALE total value is now derived from sum(unitPrice × quantity)
              of the lines; office staff edits the per-line unitPrice
              directly in the equipment table instead. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label={type === "SALE" ? t("wizard.deliveryDate") : t("startDate")}
            >
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
          </div>
          {lines.length > 0 && (
            <FormField label={t("wizard.pickEquipment")}>
              <div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
                <table className="w-full text-sm">
                  <thead className="bg-[#fafafa] text-xs text-[#525252]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">{tc("name")}</th>
                      <th className="w-40 px-2 py-1.5 text-left">
                        {type === "RENTAL" || type === "MAINTENANCE"
                          ? t("wizard.monthlyFeePerUnit")
                          : t("wizard.unitPrice")}
                      </th>
                      <th className="w-28 px-2 py-1.5 text-left">{t("wizard.quantity")}</th>
                      <th className="w-20 px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const isExisting = l.kind === "existing";
                      const key = isExisting ? l.equipmentId : l.rowId;
                      const label = isExisting
                        ? (() => {
                            const eq = equipment.find((e) => e.id === l.equipmentId);
                            return eq
                              ? `${eq.modelCode} — ${eq.modelName}`
                              : l.equipmentId;
                          })()
                        : (() => {
                            const cm = catalog.find((c) => c.id === l.modelId);
                            return cm
                              ? `${cm.modelCode ?? ""} — ${pickEquipmentLabel({ model: cm }, locale)}`
                              : l.modelId;
                          })();
                      return (
                        <tr key={key} className="border-t border-[#f5f5f5]">
                          <td className="px-2 py-1.5">{label}</td>
                          <td className="px-2 py-1.5">
                            <NumberInput
                              value={l.unitPrice ?? 0}
                              onChange={(v) =>
                                isExisting
                                  ? updateExistingLine(l.equipmentId, { unitPrice: v })
                                  : updateNewLine(l.rowId, { unitPrice: v })
                              }
                              min={0}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberInput
                              value={l.quantity}
                              onChange={(v) =>
                                isExisting
                                  ? updateExistingLine(l.equipmentId, { quantity: v })
                                  : updateNewLine(l.rowId, { quantity: v })
                              }
                              min={1}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                isExisting ? removeLine(l.equipmentId) : removeNewLine(l.rowId)
                              }
                            >
                              {t("wizard.removeLine")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </FormField>
          )}
          <FormField label={tc("notes")}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4">
          <p className="text-sm text-[#525252]">{t("wizard.reviewIntro")}</p>
          <div className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#737373]">{t("customer")}</span>
              <span>{customer?.code} — {customer?.name}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-[#737373]">{t("type")}</span>
              <span>{type && <ContractTypeBadge type={type} />}</span>
            </div>
            {type === "RENTAL" && (
              <>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[#737373]">{t("termMonths")}</span>
                  <span>{termMonths}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[#737373]">{t("monthlyFee")}</span>
                  <span>{formatVnd(linesValueSum)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[#737373]">{t("deposit")}</span>
                  <span>{formatVnd(deposit)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[#737373]">{t("endOfTermAction")}</span>
                  <span>{t(`endOfTermActions.${endOfTermAction}` as never)}</span>
                </div>
              </>
            )}
            {type === "MAINTENANCE" && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-[#737373]">{t("monthlyFee")}</span>
                <span>{formatVnd(linesValueSum)}</span>
              </div>
            )}
            {type === "SALE" && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-[#737373]">{t("totalValue")}</span>
                <span>{formatVnd(linesValueSum)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-[#737373]">{t("wizard.pickEquipment")}</span>
              <span>{lines.length}</span>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <footer className="flex items-center justify-between">
        <div>
          {step > 1 && (
            <Button variant="ghost" onClick={back} disabled={submitting}>
              {tc("previous")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step < 4 && <Button onClick={next}>{tc("next")}</Button>}
          {step === 4 && (
            <Button onClick={submit} isLoading={submitting}>
              {t("wizard.submit")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function NewCustomerQuickModal({
  onClose,
  onCreated,
}: Readonly<{
  onClose: () => void;
  onCreated: (created: CustomerOption) => void;
}>) {
  const t = useTranslations("contracts");
  const tCust = useTranslations("customers");
  const tc = useTranslations("common");
  const api = useApi();
  const [type, setType] = useState<"B2C" | "B2B">("B2C");
  const [name, setName] = useState("");
  const [shortcode, setShortcode] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [address, setAddress] = useState("");
  const [cpName, setCpName] = useState("");
  const [cpPhone, setCpPhone] = useState("");
  const [cpEmail, setCpEmail] = useState("");
  const [opsName, setOpsName] = useState("");
  const [opsPhone, setOpsPhone] = useState("");
  const [opsEmail, setOpsEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        type,
        name,
        address: address || undefined,
        contractParty: {
          name: cpName,
          phone1: cpPhone,
          email: cpEmail || undefined,
        },
      };
      if (type === "B2B") {
        body.shortcode = shortcode.toUpperCase();
        body.taxCode = taxCode;
        body.opsContacts = [
          {
            name: opsName,
            phone1: opsPhone,
            email: opsEmail || undefined,
            isPrimary: true,
          },
        ];
      } else {
        body.opsContacts =
          opsName && opsPhone
            ? [{ name: opsName, phone1: opsPhone, email: opsEmail || undefined, isPrimary: true }]
            : [];
      }
      const res = await api.post<{ id: string; code: string; name: string; type: "B2C" | "B2B"; shortcode: string | null }>(
        "/api/customers",
        body,
      );
      onCreated({
        id: res.data.id,
        code: res.data.code,
        name: res.data.name,
        type: res.data.type,
        shortcode: res.data.shortcode ?? null,
      });
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const requiredFilled =
    name.trim() &&
    cpName.trim() &&
    cpPhone.trim() &&
    (type === "B2C" || (shortcode.trim() && taxCode.trim() && opsName.trim() && opsPhone.trim()));

  return (
    <Modal
      open
      onClose={onClose}
      title={t("wizard.newCustomerTitle")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy} disabled={!requiredFilled}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={tc("type")} required>
            <Combobox
              value={type}
              onChange={(v) => v && setType(v as "B2C" | "B2B")}
              options={[
                { value: "B2C", label: "B2C" },
                { value: "B2B", label: "B2B" },
              ]}
              searchable={false}
              allowClear={false}
            />
          </FormField>
          <FormField label={tc("name")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          {type === "B2B" && (
            <>
              <FormField label="Shortcode" required>
                <Input
                  value={shortcode}
                  onChange={(e) => setShortcode(e.target.value.toUpperCase())}
                  placeholder="ABC"
                />
              </FormField>
              <FormField label="Tax code" required>
                <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
              </FormField>
            </>
          )}
          <FormField label={tc("address")} className="sm:col-span-2">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
        </div>

        <fieldset className="rounded-lg border border-[#e5e5e5] p-3">
          <legend className="px-1 text-xs font-medium text-[#525252]">
            {tCust("contractParty")}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label={tc("name")} required>
              <Input value={cpName} onChange={(e) => setCpName(e.target.value)} />
            </FormField>
            <FormField label={tc("phone")} required>
              <Input value={cpPhone} onChange={(e) => setCpPhone(e.target.value)} />
            </FormField>
            <FormField label={tc("email")}>
              <Input value={cpEmail} onChange={(e) => setCpEmail(e.target.value)} type="email" />
            </FormField>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-[#e5e5e5] p-3">
          <legend className="px-1 text-xs font-medium text-[#525252]">
            {tCust("opsContact")} {type === "B2B" ? "*" : `(${tc("optional")})`}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label={tc("name")} required={type === "B2B"}>
              <Input value={opsName} onChange={(e) => setOpsName(e.target.value)} />
            </FormField>
            <FormField label={tc("phone")} required={type === "B2B"}>
              <Input value={opsPhone} onChange={(e) => setOpsPhone(e.target.value)} />
            </FormField>
            <FormField label={tc("email")}>
              <Input value={opsEmail} onChange={(e) => setOpsEmail(e.target.value)} type="email" />
            </FormField>
          </div>
        </fieldset>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function AddEquipmentQuickModal({
  customerId,
  customerType,
  onClose,
  onCreated,
}: Readonly<{
  customerId: string;
  customerType: "B2C" | "B2B";
  onClose: () => void;
  onCreated: (equipmentId: string) => void | Promise<void>;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();

  interface ModelOpt {
    id: string;
    name: string;
    nameKo: string | null;
    nameVi: string | null;
    nameEn: string | null;
  }
  interface SiteOpt {
    id: string;
    name: string;
  }

  const [modelId, setModelId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [installedAt, setInstalledAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [ownership, setOwnership] = useState<"COMPANY" | "CUSTOMER">("COMPANY");
  // 외부 (타사) 기기 mode for MAINTENANCE contracts: hide the catalog
  // model picker and accept a free-text description + cycle instead.
  const [isExternal, setIsExternal] = useState(false);
  const [customDescription, setCustomDescription] = useState("");
  const [customMaintenanceCycle, setCustomMaintenanceCycle] =
    useState<number>(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const modelsQuery = useApiQuery<ModelOpt[]>(
    "/api/equipment-models?pageSize=200&isActive=true",
  );
  const models = modelsQuery.data ?? [];

  const sitesQuery = useApiQuery<SiteOpt[]>(
    customerType === "B2B" ? `/api/customers/${customerId}/sites` : null,
  );
  const sites = sitesQuery.data ?? [];

  async function submit() {
    if (!isExternal && !modelId) return;
    if (isExternal && customDescription.trim().length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        customerId,
        siteId: siteId || undefined,
        serialNumber: serialNumber.trim() || undefined,
        // External devices are by definition owned by the customer.
        ownership: isExternal ? "CUSTOMER" : ownership,
        installedAt: installedAt ? new Date(installedAt).toISOString() : undefined,
      };
      if (isExternal) {
        payload.customDescription = customDescription.trim();
        payload.customMaintenanceCycle = customMaintenanceCycle || undefined;
      } else {
        payload.modelId = modelId;
      }
      const res = await api.post<{ id: string }>(`/api/equipment`, payload);
      await onCreated(res.data.id);
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("installNew")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={submit}
            isLoading={busy}
            disabled={
              isExternal ? customDescription.trim().length === 0 : !modelId
            }
          >
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isExternal}
            onChange={(e) => setIsExternal(e.target.checked)}
          />
          {t("external.toggle")}
        </label>
        {isExternal ? (
          <>
            <FormField
              label={t("external.customDescription")}
              required
              className="sm:col-span-2"
              hint={t("external.customDescriptionHint")}
            >
              <Input
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="예: 타사 정수기 모델 XYZ"
              />
            </FormField>
            <FormField label={t("external.customMaintenanceCycle")}>
              <Input
                type="number"
                value={customMaintenanceCycle}
                onChange={(e) =>
                  setCustomMaintenanceCycle(Number(e.target.value))
                }
                min={1}
                max={120}
              />
            </FormField>
          </>
        ) : (
          <FormField label={t("model")} required className="sm:col-span-2">
            <Combobox
              value={modelId}
              onChange={setModelId}
              options={models.map((m) => ({
                value: m.id,
                label: m.nameKo ?? m.nameVi ?? m.nameEn ?? m.name,
              }))}
              placeholder={t("model")}
              searchable
            />
          </FormField>
        )}
        {customerType === "B2B" && sites.length > 0 && (
          <FormField label={t("site")} className="sm:col-span-2">
            <Combobox
              value={siteId}
              onChange={setSiteId}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("site")}
              searchable={sites.length > 5}
              allowClear
            />
          </FormField>
        )}
        <FormField label={t("serial")}>
          <Input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </FormField>
        <FormField label={t("installDate")}>
          <Input
            type="date"
            value={installedAt}
            onChange={(e) => setInstalledAt(e.target.value)}
          />
        </FormField>
        <FormField label={t("ownership")}>
          <Combobox
            value={ownership}
            onChange={(v) => v && setOwnership(v as "COMPANY" | "CUSTOMER")}
            options={[
              { value: "COMPANY", label: t("ownershipValues.COMPANY") },
              { value: "CUSTOMER", label: t("ownershipValues.CUSTOMER") },
            ]}
            searchable={false}
            allowClear={false}
          />
        </FormField>
      </div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-[var(--brand-blue-100)] px-2 py-0.5 text-[var(--brand-blue-700)]"
          : done
          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"
          : "rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[#737373]"
      }
    >
      {label}
    </span>
  );
}
