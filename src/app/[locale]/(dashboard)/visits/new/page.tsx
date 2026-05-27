"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { NumberInput } from "@/components/ui/number-input";

interface CustomerLite {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
}
interface SiteLite {
  id: string;
  name: string;
}
interface EquipmentLite {
  id: string;
  serialNumber: string | null;
  model: { modelCode: string; name: string };
  siteId?: string | null;
}

export default function NewVisitPage() {
  const t = useTranslations("visits");
  const router = useRouter();
  const api = useApi();

  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteLite[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<EquipmentLite[]>([]);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [type, setType] = useState<string>("PERIODIC_INSPECTION");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [window, setWindow] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load customers (paginated; first 100 is enough for picker — search via combobox).
  useEffect(() => {
    let cancelled = false;
    api
      .get<CustomerLite[]>("/api/customers?pageSize=100")
      .then((res) => {
        if (!cancelled) setCustomers(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Load sites + equipment when customer changes.
  useEffect(() => {
    if (!customerId) {
      setSites([]);
      setEquipment([]);
      setSiteId(null);
      setEquipmentId(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.get<{ sites: SiteLite[] }>(`/api/customers/${customerId}`),
      api.get<EquipmentLite[]>(`/api/equipment?customerId=${customerId}&pageSize=100`),
    ])
      .then(([cRes, eRes]) => {
        if (cancelled) return;
        const customer = cRes.data as unknown as { sites: SiteLite[] };
        setSites(customer?.sites ?? []);
        setEquipment(eRes.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, customerId]);

  const customerOptions: ComboboxOption[] = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.name,
        description: `${c.code} · ${c.type}`,
      })),
    [customers],
  );

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const showSite = selectedCustomer?.type === "B2B";

  const submit = async () => {
    setError(null);
    if (!customerId || !scheduledFor) {
      setError("Customer and date are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ id: string }>(`/api/visits`, {
        customerId,
        siteId: siteId || undefined,
        equipmentId: equipmentId || undefined,
        type,
        scheduledFor: new Date(scheduledFor).toISOString(),
        scheduledWindow: window || undefined,
        expectedAmount: amount > 0 ? amount : undefined,
      });
      router.push(`/visits/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">
          {t("createForm.title")}
        </h1>
        <p className="mt-1 text-sm text-[#737373]">{t("createForm.subtitle")}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("createForm.customer")} required>
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder={t("createForm.customerPick")}
            searchable
          />
        </FormField>

        {showSite && (
          <FormField label={t("createForm.site")}>
            <Combobox
              value={siteId}
              onChange={setSiteId}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("createForm.sitePick")}
              searchable={false}
            />
          </FormField>
        )}

        <FormField label={t("createForm.equipment")}>
          <Combobox
            value={equipmentId}
            onChange={setEquipmentId}
            options={equipment.map((e) => ({
              value: e.id,
              label: `${e.model.modelCode} · ${e.serialNumber ?? "—"}`,
              description: e.model.name,
            }))}
            placeholder={t("createForm.equipmentPick")}
            searchable
          />
        </FormField>

        <FormField label={t("createForm.type")} required>
          <Combobox
            value={type}
            onChange={(v) => setType(v ?? "PERIODIC_INSPECTION")}
            options={[
              { value: "INSTALLATION", label: t("types.INSTALLATION") },
              { value: "PERIODIC_INSPECTION", label: t("types.PERIODIC_INSPECTION") },
              { value: "REPAIR", label: t("types.REPAIR") },
              { value: "FILTER_REPLACEMENT", label: t("types.FILTER_REPLACEMENT") },
              { value: "RELOCATION", label: t("types.RELOCATION") },
              { value: "PAYMENT_COLLECTION", label: t("types.PAYMENT_COLLECTION") },
              { value: "OTHER", label: t("types.OTHER") },
            ]}
            allowClear={false}
            searchable={false}
          />
        </FormField>

        <FormField label={t("createForm.scheduledFor")} required>
          <Input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </FormField>

        <FormField label={t("createForm.scheduledWindow")}>
          <Input
            value={window}
            placeholder="e.g. morning, 14:00-16:00"
            onChange={(e) => setWindow(e.target.value)}
          />
        </FormField>

        <FormField label={t("createForm.expectedAmount")}>
          <NumberInput
            value={amount}
            onChange={setAmount}
            min={0}
            allowDecimal={false}
          />
        </FormField>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting || !customerId || !scheduledFor}>
          {submitting ? t("saving") : t("createForm.submit")}
        </Button>
      </div>
    </div>
  );
}
