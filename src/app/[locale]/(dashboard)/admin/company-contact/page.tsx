"use client";

/**
 * Company info editor (ADMIN only).
 *
 * Two sections:
 *  - HQ phone number (legacy "company contact" — feeds {hq_phone} placeholder
 *    + mobile "Call HQ" button)
 *  - Tax info (legal name / address / representative / MST tax code) — used
 *    when generating contracts and tax-invoice documents.
 *
 * Both are stored in SystemSetting and cached 60s in-memory.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";

interface TaxInfo {
  legalName: string;
  address: string;
  representativeName: string;
  taxCode: string;
}

interface Resp {
  current: { hqPhone: string; taxInfo: TaxInfo };
  defaults: { hqPhone: string; taxInfo: TaxInfo };
}

const EMPTY_TAX: TaxInfo = {
  legalName: "",
  address: "",
  representativeName: "",
  taxCode: "",
};

export default function CompanyInfoPage() {
  const t = useTranslations("admin.companyContact");
  const { user } = useAuth();
  const api = useApi();
  const [data, setData] = useState<Resp | null>(null);

  // HQ phone editing
  const [phoneDraft, setPhoneDraft] = useState<string>("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSaved, setPhoneSaved] = useState(false);

  // Tax info editing
  const [taxDraft, setTaxDraft] = useState<TaxInfo>(EMPTY_TAX);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [taxSaved, setTaxSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Resp>(`/api/admin/company-contact`);
      setData(res.data);
      setPhoneDraft(res.data.current.hqPhone);
      setTaxDraft(res.data.current.taxInfo);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : String(err));
    }
  }, [api]);

  useEffect(() => {
    if (user?.role === "ADMIN") load().catch(() => undefined);
  }, [user?.role, load]);

  if (user && user.role !== "ADMIN") {
    return (
      <div className="rounded-md border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700">
        {t("adminRequired")}
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-[#737373]">{t("loading")}</p>;
  }

  const submitPhone = async () => {
    setPhoneSaving(true);
    setPhoneError(null);
    setPhoneSaved(false);
    try {
      await api.put<unknown>(`/api/admin/company-contact`, { hqPhone: phoneDraft });
      setPhoneSaved(true);
      await load();
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhoneSaving(false);
    }
  };
  const phoneDirty = phoneDraft.trim() !== data.current.hqPhone;

  const submitTax = async () => {
    setTaxSaving(true);
    setTaxError(null);
    setTaxSaved(false);
    try {
      await api.patch<unknown>(`/api/admin/company-contact`, taxDraft);
      setTaxSaved(true);
      await load();
    } catch (err) {
      setTaxError(err instanceof Error ? err.message : String(err));
    } finally {
      setTaxSaving(false);
    }
  };
  const resetTax = () => setTaxDraft(data.defaults.taxInfo);
  const taxDirty =
    taxDraft.legalName.trim() !== data.current.taxInfo.legalName ||
    taxDraft.address.trim() !== data.current.taxInfo.address ||
    taxDraft.representativeName.trim() !== data.current.taxInfo.representativeName ||
    taxDraft.taxCode.trim() !== data.current.taxInfo.taxCode;
  const taxRequiredFilled =
    taxDraft.legalName.trim().length > 0 &&
    taxDraft.address.trim().length > 0 &&
    taxDraft.representativeName.trim().length > 0 &&
    taxDraft.taxCode.trim().length >= 8;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
      </header>

      {/* HQ phone */}
      <section className="flex flex-col gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#002A4D]">
          {t("phoneSectionTitle")}
        </h2>
        <FormField label={t("phoneLabel")}>
          <Input
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            inputMode="tel"
          />
        </FormField>

        {phoneError && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{phoneError}</p>
        )}
        {phoneSaved && (
          <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
            {t("savedNotice")}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={submitPhone}
            disabled={phoneSaving || !phoneDirty || phoneDraft.trim().length < 4}
          >
            {phoneSaving ? t("saving") : t("save")}
          </Button>
        </div>
      </section>

      {/* Tax info */}
      <section className="flex flex-col gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <header>
          <h2 className="text-sm font-semibold text-[#002A4D]">
            {t("taxSectionTitle")}
          </h2>
          <p className="mt-1 text-xs text-[#737373]">{t("taxSectionHint")}</p>
        </header>

        <FormField label={t("taxLegalName")} required>
          <Textarea
            value={taxDraft.legalName}
            onChange={(e) =>
              setTaxDraft((d) => ({ ...d, legalName: e.target.value }))
            }
            rows={2}
          />
        </FormField>
        <FormField label={t("taxAddress")} required>
          <Textarea
            value={taxDraft.address}
            onChange={(e) =>
              setTaxDraft((d) => ({ ...d, address: e.target.value }))
            }
            rows={3}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t("taxRepresentative")} required>
            <Input
              value={taxDraft.representativeName}
              onChange={(e) =>
                setTaxDraft((d) => ({ ...d, representativeName: e.target.value }))
              }
            />
          </FormField>
          <FormField label={t("taxCode")} required>
            <Input
              value={taxDraft.taxCode}
              onChange={(e) =>
                setTaxDraft((d) => ({ ...d, taxCode: e.target.value }))
              }
              placeholder={data.defaults.taxInfo.taxCode}
              inputMode="numeric"
            />
          </FormField>
        </div>

        {taxError && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{taxError}</p>
        )}
        {taxSaved && (
          <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
            {t("savedNotice")}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={submitTax}
            disabled={taxSaving || !taxDirty || !taxRequiredFilled}
          >
            {taxSaving ? t("saving") : t("save")}
          </Button>
          <Button onClick={resetTax} variant="secondary">
            {t("reset")}
          </Button>
        </div>
      </section>
    </div>
  );
}
