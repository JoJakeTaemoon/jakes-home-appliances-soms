"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useFieldArray } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
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

interface FormValues {
  type: "B2C" | "B2B";
  name: string;
  address?: string;
  district?: string;
  city?: string;
  preferredRegion?: string;
  notes?: string;
  shortcode?: string;
  taxCode?: string;
  contractParty: {
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
  const router = useRouter();
  const api = useApi();

  const [tab, setTab] = useState<"B2C" | "B2B">("B2C");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: defaultsFor(tab),
  });
  const { register, handleSubmit, control, reset, setValue, watch, formState } = form;
  const { errors } = formState;

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
      router.push(`/customers/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) setServerError(err.message);
      else setServerError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  });

  const language = watch("contractParty.language");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("createCustomer")}</h1>
        <Button variant="ghost" onClick={() => router.push("/customers")}>
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

          <FormField label={tc("address")} className="sm:col-span-2">
            <Input {...register("address")} />
          </FormField>
          <FormField label={tc("district")}>
            <Input {...register("district")} />
          </FormField>
          <FormField label={tc("city")}>
            <Input {...register("city")} />
          </FormField>
          <FormField label={t("preferredRegion")}>
            <Input {...register("preferredRegion")} placeholder="HCMC-D1" />
          </FormField>
          <FormField label={t("notes")} className="sm:col-span-2">
            <Textarea {...register("notes")} rows={3} />
          </FormField>
        </section>

        {/* CONTRACT PARTY */}
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

        {/* OPS CONTACTS */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#111111]">
              {tab === "B2B" ? t("form.opsContactSectionMulti") : t("form.opsContactSection")}
              {tab === "B2B" && <span className="ml-1 text-red-600">*</span>}
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

          {opsArray.fields.length === 0 && tab === "B2B" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {tv("atLeastOneOps")}
            </div>
          )}

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
          <Button variant="ghost" type="button" onClick={() => router.push("/customers")}>
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

function defaultsFor(tab: "B2C" | "B2B"): FormValues {
  return {
    type: tab,
    name: "",
    address: "",
    district: "",
    city: "",
    preferredRegion: "",
    notes: "",
    shortcode: tab === "B2B" ? "" : undefined,
    taxCode: tab === "B2B" ? "" : undefined,
    contractParty: {
      name: "",
      title: "",
      phone1: "",
      email: "",
      language: "vi",
    },
    opsContacts:
      tab === "B2B"
        ? [{ name: "", title: "", phone1: "", email: "", language: "vi", isPrimary: true }]
        : [],
  };
}
