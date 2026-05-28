"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
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

interface SiteOption { id: string; name: string }

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
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const locale = useLocale();
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
        model: { modelCode: string; name: string };
        serialNumber: string | null;
        siteId: string | null;
        site: { id: string; name: string } | null;
      }>>(`/api/equipment?customerId=${customerId}&status=ACTIVE&pageSize=200`);
      setEquipment(
        res.data.map((e) => ({
          id: e.id,
          modelCode: e.model.modelCode,
          modelName: e.model.name,
          serialNumber: e.serialNumber,
          siteId: e.siteId,
          site: e.site,
        })),
      );
    } finally {
      setLoadingEquipment(false);
    }
  }, [api, customerId]);

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
      router.push(`/contracts/${res.data.id}`);
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
          </FormField>
        </section>
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
                <Link
                  href={`/equipment/new?customerId=${customer.id}` as never}
                  className="text-xs text-[var(--brand-blue-700)] underline"
                >
                  + {t("wizard.addLine")}
                </Link>
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
      <p className="text-xs text-[#737373]">{locale.toUpperCase()}</p>
    </div>
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
