"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
}
interface SiteOption {
  id: string;
  name: string;
}
interface ModelOption {
  id: string;
  modelCode: string;
  name: string;
  category: string;
}

export default function NewEquipmentPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[#737373]">Loading…</div>}>
      <NewEquipmentInner />
    </Suspense>
  );
}

function NewEquipmentInner() {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();
  const sp = useSearchParams();
  const presetCustomer = sp.get("customerId");

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);

  const [customerId, setCustomerId] = useState<string | null>(presetCustomer);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [ownership, setOwnership] = useState<"COMPANY" | "CUSTOMER">("COMPANY");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const [cRes, mRes] = await Promise.all([
        api.get<CustomerOption[]>("/api/customers?pageSize=100"),
        api.get<ModelOption[]>("/api/equipment-models?pageSize=200"),
      ]);
      if (cancelled) return;
      setCustomers(cRes.data);
      setModels(mRes.data);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!customerId) {
        setSites([]);
        return;
      }
      const customer = customers.find((c) => c.id === customerId);
      if (customer?.type !== "B2B") {
        setSites([]);
        setSiteId(null);
        return;
      }
      const res = await api.get<SiteOption[]>(`/api/customers/${customerId}/sites`);
      if (!cancelled) setSites(res.data);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [api, customerId, customers]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/equipment", {
        customerId,
        siteId: siteId || undefined,
        modelId,
        serialNumber: serialNumber || undefined,
        ownership,
        installedAt: installedAt ? new Date(installedAt).toISOString() : undefined,
        notes: notes || undefined,
      });
      router.push(customerId ? `/customers/${customerId}` : "/equipment");
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("installNew")}</h1>
        <Button variant="ghost" onClick={() => router.push("/equipment")}>
          {tc("cancel")}
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 sm:grid-cols-2">
        <FormField label={t("form.pickCustomer")} required className="sm:col-span-2">
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({
              value: c.id,
              label: `${c.code} — ${c.name}`,
              description: c.type,
            }))}
            placeholder={t("form.pickCustomer")}
          />
        </FormField>
        {selectedCustomer?.type === "B2B" && sites.length > 0 && (
          <FormField label={t("form.pickSite")} className="sm:col-span-2">
            <Combobox
              value={siteId}
              onChange={setSiteId}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("form.pickSite")}
            />
          </FormField>
        )}
        <FormField label={t("form.pickModel")} required className="sm:col-span-2">
          <Combobox
            value={modelId}
            onChange={setModelId}
            options={models.map((m) => ({
              value: m.id,
              label: `${m.modelCode} — ${m.name}`,
              description: m.category,
            }))}
            placeholder={t("form.pickModel")}
          />
        </FormField>
        <FormField label={t("form.serialNumber")}>
          <Input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="PTS-2100-000123"
          />
        </FormField>
        <FormField label={t("form.installedAt")}>
          <Input type="date" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} />
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
        <FormField label={tc("notes")} className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </FormField>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/equipment")} disabled={busy}>
          {tc("cancel")}
        </Button>
        <Button onClick={submit} isLoading={busy} disabled={!customerId || !modelId}>
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}
