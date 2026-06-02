"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function ForgotPasswordForm() {
  const t = useTranslations("portal.forgot");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error?.message ?? t("errorGeneric"));
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]">
        <h1 className="mb-2 text-xl font-semibold text-[#002A4D]">
          {t("sentTitle")}
        </h1>
        <p className="mb-4 text-sm text-[#525252]">{t("sentBody")}</p>
        <Link
          href="/login"
          className="block w-full rounded-md bg-[var(--brand-blue-500)] px-4 h-12 text-center text-base font-medium leading-[3rem] text-white outline-none hover:bg-[var(--brand-blue-600)]"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]"
    >
      <h1 className="mb-1 text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
      <p className="mb-4 text-sm text-[#525252]">{t("subtitle")}</p>

      <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-[#262626]">
        {t("phone")}
      </label>
      <input
        id="phone"
        type="tel"
        autoComplete="tel"
        autoFocus
        inputMode="numeric"
        placeholder={t("phonePlaceholder")}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
        className="mb-4 block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-11 text-base text-[#000000] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
      />

      <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[#262626]">
        {t("name")}
      </label>
      <input
        id="name"
        type="text"
        autoComplete="name"
        placeholder={t("namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="mb-4 block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-11 text-base text-[#000000] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="block w-full rounded-md bg-[var(--brand-blue-500)] px-4 h-12 text-base font-medium text-white outline-none transition-transform duration-150 hover:bg-[var(--brand-blue-600)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        {submitting ? t("submitting") : t("submit")}
      </button>

      <Link
        href="/login"
        className="mt-4 block text-center text-sm text-[var(--brand-blue-600)] hover:underline"
      >
        {t("backToLogin")}
      </Link>
    </form>
  );
}
