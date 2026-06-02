"use client";

import { useMemo, useState } from "react";
import { useTranslations , useLocale} from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
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
  model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  siteId?: string | null;
}

export default function NewVisitPage() {
  const locale = useLocale();
  const t = useTranslations("visits");
  const router = useRouter();
  const api = useApi();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [type, setType] = useState<string>("PERIODIC_INSPECTION");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [window, setWindow] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customersQuery = useApiQuery<CustomerLite[]>(
    "/api/customers?pageSize=100",
  );
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const customerSitesQuery = useApiQuery<{ sites: SiteLite[] }>(
    customerId ? `/api/customers/${customerId}` : null,
  );
  const customerEquipmentQuery = useApiQuery<EquipmentLite[]>(
    customerId
      ? `/api/equipment?customerId=${customerId}&pageSize=100`
      : null,
  );
  const sites = customerSitesQuery.data?.sites ?? [];
  const equipment = customerEquipmentQuery.data ?? [];

  // Reset child selections when customer changes — wrap setCustomerId.
  const onCustomerChange = (id: string | null) => {
    setCustomerId(id);
    setSiteId(null);
    setEquipmentId(null);
  };

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
      router.push(`/o/visits/${res.data.id}`);
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
            onChange={onCustomerChange}
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
              label: `${pickModelName(e.model, locale)} · ${e.serialNumber ?? "—"}`,
              description: pickModelName(e.model, locale),
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
