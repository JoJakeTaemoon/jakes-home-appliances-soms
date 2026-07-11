"use client";

/**
 * Compact "create customer inline" modal — used by CustomerSearchSelect so
 * staff never has to leave the bulk-register wizard to register a new
 * customer. Collects only the fields `createCustomerSchema` requires for a
 * minimal B2C/B2B create; the full form (sales rep, notes, residency, …)
 * lives at /o/customers/new.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { VnAddressPicker, type VnAddressValue } from "@/components/ui/vn-address-picker";
import { useApi, ApiClientError } from "@/lib/api/client";
import { createCustomerSchema } from "@/lib/validators/customer";

type CustomerType = "B2C" | "B2B";
type Language = "vi" | "ko" | "en";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: { id: string }) => void;
  locale?: "vi" | "ko" | "en";
}

const EMPTY_ADDRESS: VnAddressValue = {
  provinceCode: null,
  provinceName: null,
  wardCode: null,
  wardName: null,
  street: null,
};

export function NewCustomerModal({ open, onClose, onCreated, locale = "vi" }: Readonly<Props>) {
  const t = useTranslations("equipment.newCustomerModal");
  const tc = useTranslations("common");
  const tCustomers = useTranslations("customers");
  const api = useApi();

  const [type, setType] = useState<CustomerType>("B2C");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<Language>("vi");
  const [shortcode, setShortcode] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [contractPartyName, setContractPartyName] = useState("");
  const [address, setAddress] = useState<VnAddressValue>(EMPTY_ADDRESS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType("B2C");
    setName("");
    setPhone("");
    setLanguage("vi");
    setShortcode("");
    setTaxCode("");
    setContractPartyName("");
    setAddress(EMPTY_ADDRESS);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    const base = {
      name,
      addressProvinceCode: address.provinceCode ?? undefined,
      addressProvinceName: address.provinceName ?? undefined,
      addressWardCode: address.wardCode ?? undefined,
      addressWardName: address.wardName ?? undefined,
      addressStreet: address.street ?? undefined,
    };
    const payload =
      type === "B2C"
        ? { type: "B2C" as const, ...base, phone, language, opsContacts: [] }
        : {
            type: "B2B" as const,
            ...base,
            shortcode: shortcode.toUpperCase(),
            taxCode,
            contractParty: { name: contractPartyName, phone1: phone, language },
            opsContacts: [],
          };

    const parsed = createCustomerSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ id: string; code: string }>("/api/customers", parsed.data);
      onCreated({ id: res.data.id });
      reset();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("title")}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} isLoading={submitting}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={tCustomers("type")}>
          <div className="inline-flex rounded border border-[#d4d4d4] bg-white p-0.5 text-xs">
            {(["B2C", "B2B"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setType(v)}
                aria-pressed={type === v}
                className={
                  type === v
                    ? "rounded px-3 py-1 font-medium text-white bg-[var(--brand-blue-500)]"
                    : "rounded px-3 py-1 text-[#525252] hover:text-[#111111]"
                }
              >
                {tCustomers(v === "B2C" ? "form.b2c" : "form.b2b")}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label={type === "B2B" ? t("legalName") : tc("name")} htmlFor="ncm-name" required>
          <Input id="ncm-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>

        {type === "B2B" && (
          <>
            <FormField label={t("shortcode")} htmlFor="ncm-shortcode" required hint={t("shortcodeHint")}>
              <Input
                id="ncm-shortcode"
                value={shortcode}
                maxLength={5}
                onChange={(e) => setShortcode(e.target.value.toUpperCase())}
                placeholder="SHV"
              />
            </FormField>
            <FormField label={t("taxCode")} htmlFor="ncm-taxCode" required>
              <Input id="ncm-taxCode" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
            </FormField>
            <FormField label={t("contractPartyName")} htmlFor="ncm-contractPartyName" required>
              <Input
                id="ncm-contractPartyName"
                value={contractPartyName}
                onChange={(e) => setContractPartyName(e.target.value)}
              />
            </FormField>
          </>
        )}

        <FormField label={tc("phone")} htmlFor="ncm-phone" required>
          <Input id="ncm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" inputMode="tel" />
        </FormField>

        <FormField label={tc("language")}>
          <Combobox
            value={language}
            onChange={(v) => setLanguage((v as Language) ?? "vi")}
            options={[
              { value: "vi", label: "Tiếng Việt" },
              { value: "ko", label: "한국어" },
              { value: "en", label: "English" },
            ]}
            searchable={false}
            allowClear={false}
          />
        </FormField>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[#525252]">{tc("address")}</span>
          <VnAddressPicker
            value={address}
            onChange={setAddress}
            locale={locale}
            labels={{
              province: tCustomers("addressProvince"),
              ward: tCustomers("addressWard"),
              street: tCustomers("addressStreet"),
            }}
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
