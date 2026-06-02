"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations , useLocale} from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi, ApiClientError } from "@/lib/api/client";
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

interface EquipmentLine {
  equipmentId: string;
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
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(preselectCustomer);
  const [type, setType] = useState<ContractType | null>(null);
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [lines, setLines] = useState<EquipmentLine[]>([]);
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null);
  const [termMonths, setTermMonths] = useState<number>(36);
  const [totalValue, setTotalValue] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);

  const customer = useMemo(() => customers.find((c) => c.id === customerId) ?? null, [customers, customerId]);

  // Load customer list once.
  useEffect(() => {
    let cancelled = false;
    setLoadingCustomers(true);
    api
      .get<CustomerOption[]>("/api/customers?pageSize=200&status=ACTIVE")
      .then((res) => {
        if (!cancelled) setCustomers(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoadingCustomers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Load equipment for current customer.
  const loadEquipment = useCallback(async () => {
    if (!customerId) {
      setEquipment([]);
      return;
    }
    setLoadingEquipment(true);
    try {
      const res = await api.get<Array<{
        id: string;
        model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
        serialNumber: string | null;
        siteId: string | null;
        site: { id: string; name: string } | null;
      }>>(`/api/equipment?customerId=${customerId}&status=ACTIVE&pageSize=200`);
      setEquipment(
        res.data.map((e) => ({
          id: e.id,
          modelCode: pickModelName(e.model, locale),
          modelName: pickModelName(e.model, locale),
          serialNumber: e.serialNumber,
          siteId: e.siteId,
          site: e.site,
        })),
      );
    } finally {
      setLoadingEquipment(false);
    }
  }, [api, customerId, locale]);

  useEffect(() => {
    void loadEquipment();
  }, [loadEquipment]);

  function addLine(equipmentId: string) {
    setLines((prev) =>
      prev.some((l) => l.equipmentId === equipmentId)
        ? prev
        : [...prev, { equipmentId, unitPrice: null, quantity: 1 }],
    );
  }

  function removeLine(equipmentId: string) {
    setLines((prev) => prev.filter((l) => l.equipmentId !== equipmentId));
  }

  function updateLine(equipmentId: string, patch: Partial<EquipmentLine>) {
    setLines((prev) =>
      prev.map((l) => (l.equipmentId === equipmentId ? { ...l, ...patch } : l)),
    );
  }

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
        equipment: lines.map((l) => ({
          equipmentId: l.equipmentId,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
        })),
        notes: notes.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
      };
      if (type === "RENTAL") {
        payload.termMonths = termMonths;
        payload.monthlyMaintenanceFee = monthlyFee;
      } else if (type === "MAINTENANCE") {
        payload.monthlyMaintenanceFee = monthlyFee;
      } else {
        payload.totalContractValue = totalValue;
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
          onCreated={(created) => {
            setCustomers((prev) => [created, ...prev]);
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

          <FormField label={t("wizard.pickEquipment")} required>
            <div className="flex flex-col gap-2">
              {equipment.length === 0 && (
                <p className="text-xs text-[#737373]">
                  {loadingEquipment ? tc("loading") : tc("noData")}
                </p>
              )}
              {equipment.map((e) => {
                const picked = lines.find((l) => l.equipmentId === e.id);
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
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-4">
          {type === "RENTAL" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t("monthlyFee")} required>
                <NumberInput value={monthlyFee ?? 0} onChange={(v) => setMonthlyFee(v)} min={0} />
              </FormField>
              <FormField label={t("termMonths")} required>
                <NumberInput value={termMonths} onChange={setTermMonths} min={1} max={120} />
              </FormField>
            </div>
          )}
          {type === "MAINTENANCE" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t("monthlyFee")} required>
                <NumberInput value={monthlyFee ?? 0} onChange={(v) => setMonthlyFee(v)} min={0} />
              </FormField>
              <FormField label={t("termMonths")}>
                <NumberInput value={termMonths} onChange={setTermMonths} min={1} max={120} />
              </FormField>
            </div>
          )}
          {type === "SALE" && (
            <FormField label={t("totalValue")}>
              <NumberInput value={totalValue ?? 0} onChange={(v) => setTotalValue(v)} min={0} />
            </FormField>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t("startDate")}>
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
                      <th className="px-2 py-1.5 text-right">{t("wizard.unitPrice")}</th>
                      <th className="px-2 py-1.5 text-right">{t("wizard.quantity")}</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const eq = equipment.find((e) => e.id === l.equipmentId);
                      return (
                        <tr key={l.equipmentId} className="border-t border-[#f5f5f5]">
                          <td className="px-2 py-1.5">
                            {eq ? `${eq.modelCode} — ${eq.modelName}` : l.equipmentId}
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberInput
                              value={l.unitPrice ?? 0}
                              onChange={(v) => updateLine(l.equipmentId, { unitPrice: v })}
                              min={0}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberInput
                              value={l.quantity}
                              onChange={(v) => updateLine(l.equipmentId, { quantity: v })}
                              min={1}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Button variant="ghost" size="sm" onClick={() => removeLine(l.equipmentId)}>
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
                  <span>{formatVnd(monthlyFee)}</span>
                </div>
              </>
            )}
            {type === "MAINTENANCE" && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-[#737373]">{t("monthlyFee")}</span>
                <span>{formatVnd(monthlyFee)}</span>
              </div>
            )}
            {type === "SALE" && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-[#737373]">{t("totalValue")}</span>
                <span>{formatVnd(totalValue)}</span>
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

  const [models, setModels] = useState<ModelOpt[]>([]);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [installedAt, setInstalledAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [ownership, setOwnership] = useState<"COMPANY" | "CUSTOMER">("COMPANY");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<ModelOpt[]>(
          "/api/equipment-models?pageSize=200&isActive=true",
        );
        if (!cancelled) setModels(res.data ?? []);
      } catch {
        if (!cancelled) setModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (customerType !== "B2B") {
      setSites([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<SiteOpt[]>(`/api/customers/${customerId}/sites`);
        if (!cancelled) setSites(res.data ?? []);
      } catch {
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, customerId, customerType]);

  async function submit() {
    if (!modelId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ id: string }>(`/api/equipment`, {
        customerId,
        siteId: siteId || undefined,
        modelId,
        serialNumber: serialNumber.trim() || undefined,
        ownership,
        installedAt: installedAt ? new Date(installedAt).toISOString() : undefined,
      });
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
          <Button onClick={submit} isLoading={busy} disabled={!modelId}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
