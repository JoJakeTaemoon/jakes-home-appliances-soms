"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import {
  VnAddressPicker,
  type VnAddressValue,
} from "@/components/ui/vn-address-picker";
import { useApi, ApiClientError } from "@/lib/api/client";
import { createCustomerSchema } from "@/lib/validators/customer";

interface OpsContactInput {
  name: string;
  title?: string;
  phone1: string;
  email?: string;
  language: "vi" | "ko" | "en";
  isPrimary: boolean;
}

type Residency = "DOMESTIC" | "FOREIGN";

interface FormValues {
  type: "B2C" | "B2B";
  name: string;
  // B2C only — customer IS the contract party, so phone/email/language live
  // on the customer top-level. Forked into a CONTRACT_PARTY contact server-side.
  phone?: string;
  email?: string;
  language?: "vi" | "ko" | "en";
  // Structured Vietnamese address
  addressProvinceCode?: string | null;
  addressProvinceName?: string | null;
  addressDistrictCode?: string | null;
  addressDistrictName?: string | null;
  addressWardCode?: string | null;
  addressWardName?: string | null;
  addressStreet?: string | null;
  preferredRegion?: string;
  notes?: string;
  // B2B legal block (representativeName removed — CONTRACT_PARTY is canonical signatory)
  shortcode?: string;
  taxCode?: string;
  // B2C legal block — all optional now
  residency?: Residency;
  nationalId?: string;
  passportNumber?: string;
  nationality?: string;
  // Identity document issue info (shared across CCCD / passport)
  documentIssueDate?: string;
  documentIssuePlace?: string;
  // B2B only — CONTRACT_PARTY is a separate person from the company name.
  contractParty?: {
    name: string;
    title?: string;
    phone1: string;
    email?: string;
    language: "vi" | "ko" | "en";
  };
  opsContacts: OpsContactInput[];
}

export default function NewCustomerPage() {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const tv = useTranslations("validation");
  const locale = useLocale() as "vi" | "ko" | "en";
  const router = useRouter();
  const api = useApi();

  const [tab, setTab] = useState<"B2C" | "B2B">("B2C");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: defaultsFor(tab),
  });
  const { register, handleSubmit, control, reset, setValue, formState } = form;
  const { errors } = formState;

  const address = useWatch({ control, name: ["addressProvinceCode", "addressProvinceName", "addressDistrictCode", "addressDistrictName", "addressWardCode", "addressWardName", "addressStreet"] });
  const addressValue: VnAddressValue = {
    provinceCode: address?.[0] ?? null,
    provinceName: address?.[1] ?? null,
    districtCode: address?.[2] ?? null,
    districtName: address?.[3] ?? null,
    wardCode: address?.[4] ?? null,
    wardName: address?.[5] ?? null,
    street: address?.[6] ?? null,
  };
  function setAddress(next: VnAddressValue) {
    setValue("addressProvinceCode", next.provinceCode ?? null);
    setValue("addressProvinceName", next.provinceName ?? null);
    setValue("addressDistrictCode", next.districtCode ?? null);
    setValue("addressDistrictName", next.districtName ?? null);
    setValue("addressWardCode", next.wardCode ?? null);
    setValue("addressWardName", next.wardName ?? null);
    setValue("addressStreet", next.street ?? null);
  }

  const opsArray = useFieldArray<FormValues, "opsContacts">({
    control,
    name: "opsContacts",
  });

  function switchTab(next: "B2C" | "B2B") {
    if (next === tab) return;
    setTab(next);
    reset(defaultsFor(next));
  }

  const submit = handleSubmit(async (values) => {
    setSubmitting(true);
    setServerError(null);
    try {
      // Zod-validate before sending — clean empty strings / coerce + give the
      // user a precise message if anything is off.
      const payload = {
        ...values,
        // Drop empty optional fields so they don't fail .regex() etc.
        opsContacts: values.opsContacts ?? [],
      };
      const parsed = createCustomerSchema.safeParse(payload);
      if (!parsed.success) {
        setServerError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        setSubmitting(false);
        return;
      }
      const res = await api.post<{ id: string; code: string }>("/api/customers", parsed.data);
      router.push(`/o/customers/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) setServerError(err.message);
      else setServerError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  });

  // B2C uses the top-level `language`; B2B reads from contractParty.language.
  const language = useWatch({
    control,
    name: tab === "B2C" ? "language" : "contractParty.language",
  });
  const residency = useWatch({ control, name: "residency" });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("createCustomer")}</h1>
        <Button variant="ghost" onClick={() => router.push("/o/customers")}>
          {tc("cancel")}
        </Button>
      </header>

      <div className="flex w-full items-center gap-2 rounded-xl bg-[#f5f5f5] p-1">
        {(["B2C", "B2B"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => switchTab(value)}
            className={
              tab === value
                ? "flex-1 rounded-lg bg-white px-3 py-2 text-sm font-medium text-[var(--brand-blue-700)] shadow-sm"
                : "flex-1 rounded-lg px-3 py-2 text-sm font-medium text-[#737373] hover:text-[#111111]"
            }
            aria-pressed={tab === value}
          >
            {t(value === "B2C" ? "form.b2c" : "form.b2b")}
          </button>
        ))}
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-6 rounded-2xl border border-[#e5e5e5] bg-white p-6"
      >
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label={tab === "B2B" ? t("legalName") : t("name")}
            required
            error={errors.name?.message}
            className="sm:col-span-2"
          >
            <Input {...register("name", { required: tv("required") })} />
          </FormField>

          {tab === "B2C" && (
            <>
              <FormField label={tc("phone")} required error={errors.phone?.message}>
                <Input
                  {...register("phone", { required: tv("required") })}
                  placeholder="0901234567"
                  inputMode="tel"
                />
              </FormField>
              <FormField label={tc("email")} error={errors.email?.message}>
                <Input {...register("email")} type="email" />
              </FormField>
              <FormField label={tc("language")} className="sm:col-span-2">
                <Combobox
                  value={(language ?? "vi") as string}
                  onChange={(v) =>
                    setValue("language", (v ?? "vi") as "vi" | "ko" | "en")
                  }
                  options={[
                    { value: "vi", label: "Tiếng Việt" },
                    { value: "ko", label: "한국어" },
                    { value: "en", label: "English" },
                  ]}
                  searchable={false}
                  allowClear={false}
                />
              </FormField>
            </>
          )}

          {tab === "B2B" && (
            <>
              <FormField
                label={t("shortcode")}
                required
                error={errors.shortcode?.message}
                hint={t("form.b2bShortcodeHint")}
              >
                <Input
                  {...register("shortcode", { required: tv("required") })}
                  placeholder="SHV"
                  maxLength={5}
                  onChange={(e) => setValue("shortcode", e.target.value.toUpperCase())}
                />
              </FormField>
              <FormField
                label={t("taxCode")}
                required
                error={errors.taxCode?.message}
              >
                <Input {...register("taxCode", { required: tv("required") })} placeholder="03XXXXXXXX" />
              </FormField>
            </>
          )}

          {tab === "B2C" && (
            <ResidencyBlock
              residency={residency ?? "DOMESTIC"}
              setResidency={(v) => setValue("residency", v)}
              register={register}
              errors={errors}
              t={t}
            />
          )}

          <FormField label={t("documentIssueDate")} error={errors.documentIssueDate?.message}>
            <Input type="date" {...register("documentIssueDate")} />
          </FormField>
          <FormField label={t("documentIssuePlace")} error={errors.documentIssuePlace?.message}>
            <Input {...register("documentIssuePlace")} placeholder={t("documentIssuePlacePlaceholder")} />
          </FormField>

          <div className="sm:col-span-2 flex flex-col gap-2">
            <span className="text-xs font-medium text-[#525252]">{tc("address")}</span>
            <VnAddressPicker
              value={addressValue}
              onChange={setAddress}
              locale={locale}
              labels={{
                province: t("addressProvince"),
                district: t("addressDistrict"),
                ward: t("addressWard"),
                street: t("addressStreet"),
              }}
            />
          </div>
          <FormField label={t("preferredRegion")}>
            <Input {...register("preferredRegion")} placeholder="HCMC-D1" />
          </FormField>
          <FormField label={t("notes")} className="sm:col-span-2">
            <Textarea {...register("notes")} rows={3} />
          </FormField>
        </section>

        {/* CONTRACT PARTY — B2B only. For B2C the customer's name + phone +
            email + language ARE the contract party (collected at the top). */}
        {tab === "B2B" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[#111111]">
              {t("form.contractPartySection")} <span className="text-red-600">*</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={tc("name")} required error={errors.contractParty?.name?.message}>
                <Input {...register("contractParty.name", { required: tv("required") })} />
              </FormField>
              <FormField label={tc("title")}>
                <Input {...register("contractParty.title")} />
              </FormField>
              <FormField label={tc("phone")} required error={errors.contractParty?.phone1?.message}>
                <Input
                  {...register("contractParty.phone1", { required: tv("required") })}
                  placeholder="0901234567"
                />
              </FormField>
              <FormField label={tc("email")}>
                <Input {...register("contractParty.email")} type="email" />
              </FormField>
              <FormField label={tc("language")}>
                <Combobox
                  value={language ?? "vi"}
                  onChange={(v) =>
                    setValue("contractParty.language", (v ?? "vi") as "vi" | "ko" | "en")
                  }
                  options={[
                    { value: "vi", label: "Tiếng Việt" },
                    { value: "ko", label: "한국어" },
                    { value: "en", label: "English" },
                  ]}
                  searchable={false}
                  allowClear={false}
                />
              </FormField>
            </div>
          </section>
        )}

        {/* OPS CONTACTS */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#111111]">
              {tab === "B2B" ? t("form.opsContactSectionMulti") : t("form.opsContactSection")}
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                opsArray.append({
                  name: "",
                  phone1: "",
                  language: "vi",
                  isPrimary: opsArray.fields.length === 0,
                })
              }
            >
              {t("form.addOpsContact")}
            </Button>
          </div>
          <p className="text-xs text-[#737373]">{t("form.primaryHint")}</p>

          {opsArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="flex flex-col gap-3 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#525252]">
                  {t("opsContact")} #{idx + 1}
                </span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-[#525252]">
                    <input
                      type="checkbox"
                      {...register(`opsContacts.${idx}.isPrimary` as const)}
                    />
                    {t("primaryToggle")}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => opsArray.remove(idx)}
                  >
                    {tc("remove")}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={tc("name")} required>
                  <Input
                    {...register(`opsContacts.${idx}.name` as const, { required: tv("required") })}
                  />
                </FormField>
                <FormField label={tc("title")}>
                  <Input {...register(`opsContacts.${idx}.title` as const)} />
                </FormField>
                <FormField label={tc("phone")} required>
                  <Input
                    {...register(`opsContacts.${idx}.phone1` as const, { required: tv("required") })}
                    placeholder="0901234567"
                  />
                </FormField>
                <FormField label={tc("email")}>
                  <Input {...register(`opsContacts.${idx}.email` as const)} type="email" />
                </FormField>
              </div>
            </div>
          ))}
        </section>

        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => router.push("/o/customers")}>
            {tc("cancel")}
          </Button>
          <Button type="submit" isLoading={submitting}>
            {tc("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function ResidencyBlock({
  residency,
  setResidency,
  register,
  errors,
  t,
}: Readonly<{
  residency: Residency;
  setResidency: (v: Residency) => void;
  register: any;
  errors: any;
  t: (k: string) => string;
}>) {
  return (
    <div className="sm:col-span-2 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[#525252]">{t("residency")}</span>
        <div className="inline-flex rounded-md border border-[#d4d4d4] bg-white p-0.5 text-xs">
          {(["DOMESTIC", "FOREIGN"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setResidency(value)}
              className={
                residency === value
                  ? "rounded px-3 py-1 font-medium text-white bg-[var(--brand-blue-500)]"
                  : "rounded px-3 py-1 text-[#525252] hover:text-[#111111]"
              }
              aria-pressed={residency === value}
            >
              {t(value === "DOMESTIC" ? "residencyDomestic" : "residencyForeign")}
            </button>
          ))}
        </div>
      </div>
      {residency === "DOMESTIC" ? (
        <FormField label={t("nationalId")} error={errors.nationalId?.message}>
          <Input {...register("nationalId")} placeholder="012345678901" />
        </FormField>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t("nationality")} error={errors.nationality?.message}>
            <Input
              {...register("nationality")}
              placeholder={t("nationalityPlaceholder")}
            />
          </FormField>
          <FormField label={t("passportNumber")} error={errors.passportNumber?.message}>
            <Input {...register("passportNumber")} placeholder="M12345678" />
          </FormField>
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function defaultsFor(tab: "B2C" | "B2B"): FormValues {
  return {
    type: tab,
    name: "",
    phone: tab === "B2C" ? "" : undefined,
    email: tab === "B2C" ? "" : undefined,
    language: tab === "B2C" ? "vi" : undefined,
    addressProvinceCode: null,
    addressProvinceName: null,
    addressDistrictCode: null,
    addressDistrictName: null,
    addressWardCode: null,
    addressWardName: null,
    addressStreet: null,
    preferredRegion: "",
    notes: "",
    shortcode: tab === "B2B" ? "" : undefined,
    taxCode: tab === "B2B" ? "" : undefined,
    residency: tab === "B2C" ? "DOMESTIC" : undefined,
    nationalId: tab === "B2C" ? "" : undefined,
    passportNumber: tab === "B2C" ? "" : undefined,
    nationality: tab === "B2C" ? "" : undefined,
    documentIssueDate: "",
    documentIssuePlace: "",
    contractParty:
      tab === "B2B"
        ? { name: "", title: "", phone1: "", email: "", language: "vi" }
        : undefined,
    opsContacts: [],
  };
}
