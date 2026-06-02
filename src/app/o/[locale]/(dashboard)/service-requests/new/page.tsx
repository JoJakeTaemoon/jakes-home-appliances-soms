"use client";

/**
 * UC-SR-01 — Manual service-request intake (office staff).
 *
 * The customer-portal POST already exists at /api/portal/service-requests.
 * This page hits the new staff endpoint at /api/service-requests, which lets
 * Admin / Manager / Staff file an SR on behalf of a customer who phoned in
 * or walked into the office.
 */

import { useState } from "react";
import { useApiQuery } from "@/lib/api/hooks";
import { useTranslations , useLocale} from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/input";

interface CustomerOpt {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
}

interface ContactOpt {
  id: string;
  name: string;
  role: "CONTRACT_PARTY" | "OPS_CONTACT";
  isPrimary: boolean;
  phone1: string;
}

interface EquipmentOpt {
  id: string;
  serialNumber: string | null;
  model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
}

type SrType = "INSPECTION" | "REPAIR" | "PART_REPLACEMENT" | "RELOCATION" | "OTHER";

const SR_TYPES: SrType[] = ["INSPECTION", "REPAIR", "PART_REPLACEMENT", "RELOCATION", "OTHER"];

export default function ServiceRequestNewPage() {
  const locale = useLocale();
  const t = useTranslations("serviceRequests");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();

  const [customerId, setCustomerIdRaw] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [type, setType] = useState<SrType>("INSPECTION");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const customersQuery = useApiQuery<CustomerOpt[]>(
    `/api/customers?pageSize=500&status=ACTIVE`,
  );
  const customers = customersQuery.data ?? [];

  const customerDetailQuery = useApiQuery<{
    contacts: ContactOpt[];
    equipment: EquipmentOpt[];
  }>(customerId ? `/api/customers/${customerId}` : null);
  const contacts = customerDetailQuery.data?.contacts ?? [];
  const equipment = customerDetailQuery.data?.equipment ?? [];

  // Clear contact/equipment picks when the customer changes.
  const setCustomerId = (id: string | null) => {
    setCustomerIdRaw(id);
    setContactId(null);
    setEquipmentId(null);
  };

  async function submit() {
    if (!customerId) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await api.post<{ code: string; serviceRequestId: string }>(
        "/api/service-requests",
        {
          customerId,
          contactId: contactId || undefined,
          equipmentId: equipmentId || undefined,
          type,
          description,
        },
      );
      router.push(`/o/service-requests/${result.data.serviceRequestId}`);
    } catch (e) {
      setErr(
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : tc("error"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("newPageTitle")}</h1>
        <Button variant="ghost" onClick={() => router.push("/o/service-requests")}>
          {tc("cancel")}
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 sm:grid-cols-2">
        <FormField label={t("customerLabel")} required className="sm:col-span-2">
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({
              value: c.id,
              label: `${c.code} — ${c.name}`,
            }))}
            placeholder={t("customerPlaceholder")}
            searchable
          />
        </FormField>

        {customerId && (
          <>
            <FormField label={t("contactLabel")}>
              <Combobox
                value={contactId}
                onChange={setContactId}
                options={contacts.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.isPrimary ? " ★" : ""} (${c.role === "CONTRACT_PARTY" ? "CP" : "OPS"})`,
                }))}
                placeholder={t("contactPlaceholder")}
                searchable={contacts.length > 5}
                allowClear
              />
            </FormField>

            <FormField label={t("equipmentLabel")}>
              <Combobox
                value={equipmentId}
                onChange={setEquipmentId}
                options={equipment.map((e) => ({
                  value: e.id,
                  label: `${pickModelName(e.model, locale)}${e.serialNumber ? ` / ${e.serialNumber}` : ""}`,
                }))}
                placeholder={t("equipmentPlaceholder")}
                searchable={equipment.length > 5}
                allowClear
              />
            </FormField>
          </>
        )}

        <FormField label={t("typeLabel")} required>
          <Combobox
            value={type}
            onChange={(v) => v && setType(v as SrType)}
            options={SR_TYPES.map((value) => ({
              value,
              label: t(`types.${value}` as never),
            }))}
            searchable={false}
            allowClear={false}
          />
        </FormField>

        <FormField label={t("descriptionLabel")} required className="sm:col-span-2">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder={t("descriptionHint")}
          />
        </FormField>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/o/service-requests")} disabled={busy}>
          {tc("cancel")}
        </Button>
        <Button
          onClick={submit}
          isLoading={busy}
          disabled={!customerId || description.trim().length < 10}
        >
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}
