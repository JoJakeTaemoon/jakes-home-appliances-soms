"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { useAuth } from "@/providers/auth-provider";
import { canResetCustomerPassword } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { BackButton } from "@/components/ui/back-button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";

interface SalesRepOption {
  id: string;
  username: string;
  title: string | null;
}
import {
  VnAddressPicker,
  type VnAddressValue,
} from "@/components/ui/vn-address-picker";

type Residency = "DOMESTIC" | "FOREIGN";

interface CustomerContactSummary {
  id: string;
  role: "CONTRACT_PARTY" | "OPS_CONTACT";
  name: string;
  phone1: string;
  portalEnabled: boolean;
}

interface CustomerDetail {
  id: string;
  code: string;
  type: "B2C" | "B2B";
  name: string;
  shortcode: string | null;
  taxCode: string | null;
  residency: Residency | null;
  nationalId: string | null;
  passportNumber: string | null;
  nationality: string | null;
  documentIssueDate: string | null;
  documentIssuePlace: string | null;
  addressProvinceCode: string | null;
  addressProvinceName: string | null;
  addressWardCode: string | null;
  addressWardName: string | null;
  addressStreet: string | null;
  /** @deprecated legacy */
  address: string | null;
  /** @deprecated legacy */
  district: string | null;
  /** @deprecated legacy */
  city: string | null;
  preferredRegion: string | null;
  salesRepId: string | null;
  notes: string | null;
  contacts: CustomerContactSummary[];
}

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const locale = useLocale() as "vi" | "ko" | "en";
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();

  const query = useApiQuery<CustomerDetail>(
    id ? `/api/customers/${id}` : null,
  );
  const salesRepsQuery = useApiQuery<SalesRepOption[]>("/api/sales-reps");
  const salesReps = salesRepsQuery.data ?? [];
  const loading = query.isLoading;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useState<Partial<CustomerDetail>>({});
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null);
  const data = useMemo<CustomerDetail | null>(
    () => (query.data ? { ...query.data, ...edits } : null),
    [query.data, edits],
  );
  // B2C: customer phone is the CONTRACT_PARTY contact's phone1. Surface it as
  // an editable top-level field; PATCH forwards it to the contact in a tx.
  const contractPartyContact = data?.contacts?.find(
    (c) => c.role === "CONTRACT_PARTY",
  );
  const phone = phoneEdit ?? contractPartyContact?.phone1 ?? "";
  const patch = (next: Partial<CustomerDetail>) => {
    setEdits((prev) => ({ ...prev, ...next }));
  };

  const addressValue: VnAddressValue = {
    provinceCode: data?.addressProvinceCode ?? null,
    provinceName: data?.addressProvinceName ?? null,
    wardCode: data?.addressWardCode ?? null,
    wardName: data?.addressWardName ?? null,
    // Pre-fill street from legacy `address` when migrated row hasn't been
    // upgraded to structured yet.
    street: data?.addressStreet ?? data?.address ?? null,
  };

  async function submit() {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      const orEmpty = (v: string | null | undefined) => v || undefined;
      const phoneChanged =
        data.type === "B2C" &&
        phoneEdit !== null &&
        phoneEdit !== contractPartyContact?.phone1;
      await api.patch(`/api/customers/${id}`, {
        name: data.name,
        shortcode: orEmpty(data.shortcode),
        taxCode: orEmpty(data.taxCode),
        residency: data.residency ?? undefined,
        nationalId: orEmpty(data.nationalId),
        passportNumber: orEmpty(data.passportNumber),
        nationality: orEmpty(data.nationality),
        documentIssueDate: orEmpty(data.documentIssueDate),
        documentIssuePlace: orEmpty(data.documentIssuePlace),
        addressProvinceCode: orEmpty(data.addressProvinceCode),
        addressProvinceName: orEmpty(data.addressProvinceName),
        addressWardCode: orEmpty(data.addressWardCode),
        addressWardName: orEmpty(data.addressWardName),
        addressStreet: orEmpty(data.addressStreet),
        ...(phoneChanged ? { phone: phoneEdit } : {}),
        preferredRegion: orEmpty(data.preferredRegion),
        salesRepId: data.salesRepId ?? null,
        notes: orEmpty(data.notes),
      });
      router.push(`/o/customers/${id}`);
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("editCustomer")}</h1>
        <BackButton fallback={`/o/customers/${id}`}>{tc("cancel")}</BackButton>
      </header>
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 sm:grid-cols-2">
        <FormField label={t("name")} className="sm:col-span-2" required>
          <Input value={data.name} onChange={(e) => patch({ name: e.target.value })} />
        </FormField>
        {data.type === "B2C" && (
          <FormField label={tc("phone")} className="sm:col-span-2" required>
            <Input
              value={phone}
              onChange={(e) => setPhoneEdit(e.target.value)}
              placeholder="0901234567"
              inputMode="tel"
            />
          </FormField>
        )}
        {data.type === "B2B" && (
          <>
            <FormField label={t("shortcode")}>
              <Input
                value={data.shortcode ?? ""}
                onChange={(e) => patch({ shortcode: e.target.value.toUpperCase() })}
                maxLength={5}
              />
            </FormField>
            <FormField label={t("taxCode")}>
              <Input
                value={data.taxCode ?? ""}
                onChange={(e) => patch({ taxCode: e.target.value })}
              />
            </FormField>
          </>
        )}

        {data.type === "B2C" && (
          <div className="sm:col-span-2 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[#525252]">{t("residency")}</span>
              <div className="inline-flex rounded-md border border-[#d4d4d4] bg-white p-0.5 text-xs">
                {(["DOMESTIC", "FOREIGN"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patch({ residency: value })}
                    className={
                      data.residency === value
                        ? "rounded px-3 py-1 font-medium text-white bg-[var(--brand-blue-500)]"
                        : "rounded px-3 py-1 text-[#525252] hover:text-[#111111]"
                    }
                    aria-pressed={data.residency === value}
                  >
                    {t(value === "DOMESTIC" ? "residencyDomestic" : "residencyForeign")}
                  </button>
                ))}
              </div>
            </div>
            {data.residency === "FOREIGN" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("nationality")}>
                  <Input
                    value={data.nationality ?? ""}
                    onChange={(e) => patch({ nationality: e.target.value })}
                    placeholder={t("nationalityPlaceholder")}
                  />
                </FormField>
                <FormField label={t("passportNumber")}>
                  <Input
                    value={data.passportNumber ?? ""}
                    onChange={(e) => patch({ passportNumber: e.target.value })}
                    placeholder="M12345678"
                  />
                </FormField>
              </div>
            ) : (
              <FormField label={t("nationalId")}>
                <Input
                  value={data.nationalId ?? ""}
                  onChange={(e) => patch({ nationalId: e.target.value })}
                  placeholder="012345678901"
                />
              </FormField>
            )}
          </div>
        )}

        <FormField label={t("documentIssueDate")}>
          <Input
            type="date"
            value={data.documentIssueDate?.substring(0, 10) ?? ""}
            onChange={(e) => patch({ documentIssueDate: e.target.value || null })}
          />
        </FormField>
        <FormField label={t("documentIssuePlace")}>
          <Input
            value={data.documentIssuePlace ?? ""}
            onChange={(e) => patch({ documentIssuePlace: e.target.value })}
            placeholder={t("documentIssuePlacePlaceholder")}
          />
        </FormField>

        <div className="sm:col-span-2 flex flex-col gap-2">
          <span className="text-xs font-medium text-[#525252]">{tc("address")}</span>
          <VnAddressPicker
            value={addressValue}
            onChange={(next) =>
              patch({
                addressProvinceCode: next.provinceCode ?? null,
                addressProvinceName: next.provinceName ?? null,
                addressWardCode: next.wardCode ?? null,
                addressWardName: next.wardName ?? null,
                addressStreet: next.street ?? null,
              })
            }
            locale={locale}
            labels={{
              province: t("addressProvince"),
              ward: t("addressWard"),
              street: t("addressStreet"),
            }}
          />
        </div>

        <FormField label={t("preferredRegion")}>
          <Input
            value={data.preferredRegion ?? ""}
            onChange={(e) => patch({ preferredRegion: e.target.value })}
            placeholder="HCMC-D1"
          />
        </FormField>
        <FormField label={t("salesRep")}>
          <Combobox
            value={data.salesRepId ?? null}
            onChange={(v) => patch({ salesRepId: (v as string | null) ?? null })}
            options={salesReps.map((r) => ({
              value: r.id,
              label: r.title ? `${r.username} · ${r.title}` : r.username,
            }))}
            placeholder={salesRepsQuery.isLoading ? tc("loading") : t("all")}
            searchable
          />
        </FormField>
        <FormField label={t("notes")} className="sm:col-span-2">
          <Textarea
            value={data.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
          />
        </FormField>
      </div>
      {canResetCustomerPassword(user?.role ?? "") && (
        <PortalPasswordCard customerId={id} contacts={data.contacts ?? []} />
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}
      <div className="flex items-center justify-end gap-2">
        <BackButton fallback={`/o/customers/${id}`} disabled={busy}>
          {tc("cancel")}
        </BackButton>
        <Button onClick={submit} isLoading={busy}>
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Portal password reset (MANAGER+) — UC-AU-06
//
// Nothing is sent: the API hands back the new password, it is shown once,
// and the office reads it out on the phone. Same shape as the staff reset on
// 관리자 → 사용자 관리, so a credential never reaches a delivery log.
// ─────────────────────────────────────────────────────────────────────────

function PortalPasswordCard({
  customerId,
  contacts,
}: Readonly<{ customerId: string; contacts: CustomerContactSummary[] }>) {
  const t = useTranslations("customers");
  const portalContacts = contacts.filter((c) => c.portalEnabled);
  const [target, setTarget] = useState<CustomerContactSummary | null>(null);

  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
      <h2 className="text-sm font-semibold text-[#002A4D]">
        {t("resetPortalPassword")}
      </h2>
      <p className="mt-1 text-xs text-[#737373]">
        {t("resetPortalPasswordHint")}
      </p>
      {portalContacts.length === 0 ? (
        <p className="mt-3 text-sm text-[#a3a3a3]">
          {t("resetPortalPasswordNone")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[#f0f0f0]">
          {portalContacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-[#262626]">
                {c.name}
                <span className="ml-2 font-mono text-xs text-[#737373]">
                  {c.phone1}
                </span>
              </span>
              <Button variant="secondary" size="sm" onClick={() => setTarget(c)}>
                {t("resetPortalPassword")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {target && (
        <PortalPasswordModal
          customerId={customerId}
          contact={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}

function PortalPasswordModal({
  customerId,
  contact,
  onClose,
}: Readonly<{
  customerId: string;
  contact: CustomerContactSummary;
  onClose: () => void;
}>) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ tempPassword: string }>(
        `/api/customers/${customerId}/contacts/${contact.id}/reset-password`,
      );
      setTempPassword(res.data.tempPassword);
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
      title={t("resetPortalPassword")}
      size="sm"
      footer={
        tempPassword ? (
          <Button onClick={onClose}>{t("resetPortalPasswordDone")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {tc("cancel")}
            </Button>
            <Button onClick={submit} isLoading={busy}>
              {t("resetPortalPassword")}
            </Button>
          </>
        )
      }
    >
      {tempPassword ? (
        <div>
          <p className="text-sm text-[#525252]">
            {t("resetPortalPasswordSuccess", { name: contact.name })}
          </p>
          <p className="mt-3 select-all rounded-md border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-center font-mono text-lg tracking-widest text-[#262626]">
            {tempPassword}
          </p>
          <p className="mt-3 text-sm font-medium text-[#b45309]">
            {t("resetPortalPasswordOnce")}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-[#525252]">
            {t("resetPortalPasswordConfirm", {
              name: contact.name,
              phone: contact.phone1,
            })}
          </p>
          {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
        </div>
      )}
    </Modal>
  );
}
