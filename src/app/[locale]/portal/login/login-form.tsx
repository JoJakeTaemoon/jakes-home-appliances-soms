"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/navigation";
import {
  useCustomerAuth,
  type PortalLoginCandidate,
} from "@/providers/customer-auth-provider";

const PORTAL_STORAGE_KEYS = ["soms_portal_contact", "soms_portal_access", "soms_portal_auth"];

export function PortalLoginForm() {
  const t = useTranslations("portal.login");
  const { login } = useCustomerAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<PortalLoginCandidate[] | null>(null);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      for (const k of PORTAL_STORAGE_KEYS) sessionStorage.removeItem(k);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent, contactId?: string) => {
    e.preventDefault();
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await login(phone.trim(), password, contactId);
      if (result.candidates) {
        setCandidates(result.candidates);
        return;
      }
      if (result.mustChangePassword) {
        router.replace("/portal/change-password");
        return;
      }
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/portal") ? next : "/portal");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "UNKNOWN";
      switch (code) {
        case "INVALID_CREDENTIALS":
          setServerError(t("errorInvalidCredentials"));
          break;
        case "ACCOUNT_LOCKED":
          setServerError(t("errorLocked"));
          break;
        default:
          setServerError(t("errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (candidates) {
    return (
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]">
        <h2 className="mb-1 text-base font-semibold text-[#002A4D]">
          {t("candidatesTitle")}
        </h2>
        <p className="mb-4 text-sm text-[#525252]">{t("candidatesSubtitle")}</p>
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={(ev) => onSubmit(ev, c.id)}
                disabled={submitting}
                className="block w-full rounded-md border border-[#e5e5e5] bg-white px-4 py-3 text-left text-sm text-[#262626] outline-none transition-colors hover:border-[var(--brand-blue-500)] hover:bg-[var(--brand-blue-50)] disabled:opacity-60"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-[#737373]">
                  {c.customerName} ({c.customerCode})
                </div>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            setCandidates(null);
            setServerError(null);
          }}
          className="mt-4 block w-full text-center text-xs text-[#737373] underline-offset-2 hover:underline"
        >
          {t("candidatesBack")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]"
    >
      <div className="mb-4">
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
          className="block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-11 text-base text-[#000000] placeholder:text-[#a3a3a3] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
        />
      </div>
      <div className="mb-4">
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#262626]">
          {t("password")}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-11 text-base text-[#000000] placeholder:text-[#a3a3a3] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
        />
      </div>
      {serverError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]"
        >
          {serverError}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="block w-full rounded-md bg-[var(--brand-blue-500)] px-4 h-12 text-base font-medium text-white outline-none transition-transform duration-150 hover:bg-[var(--brand-blue-600)] hover:scale-[1.02] active:scale-100 active:bg-[var(--brand-blue-700)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        {submitting ? t("submitting") : t("submit")}
      </button>

      <Link
        href="/portal/forgot-password"
        className="mt-4 block text-center text-sm text-[var(--brand-blue-600)] hover:underline"
      >
        {t("forgot")}
      </Link>
    </form>
  );
}
