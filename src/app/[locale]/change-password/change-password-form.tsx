"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";

export function ChangePasswordForm() {
  const t = useTranslations("portal.changePassword");
  const { accessToken, refresh } = useCustomerAuth();
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [nextPwd, setNextPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nextPwd.length < 8) {
      setError(t("errorMinLength"));
      return;
    }
    if (nextPwd !== confirm) {
      setError(t("errorMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: nextPwd }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const code = json?.error?.code ?? "UNKNOWN";
        if (code === "WRONG_PASSWORD") setError(t("errorWrongCurrent"));
        else if (code === "PASSWORD_REUSE") setError(t("errorReuse"));
        else setError(json?.error?.message ?? t("errorGeneric"));
        return;
      }
      setSuccess(true);
      await refresh();
      setTimeout(() => router.replace("/"), 800);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]"
    >
      <h1 className="mb-1 text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
      <p className="mb-4 text-sm text-[#525252]">{t("subtitle")}</p>

      <label htmlFor="cur" className="mb-1.5 block text-sm font-medium text-[#262626]">
        {t("current")}
      </label>
      <input
        id="cur"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
        className="mb-4 block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-11 text-base text-[#000000] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
      />

      <label htmlFor="new" className="mb-1.5 block text-sm font-medium text-[#262626]">
        {t("newPwd")}
      </label>
      <input
        id="new"
        type="password"
        autoComplete="new-password"
        value={nextPwd}
        onChange={(e) => setNextPwd(e.target.value)}
        required
        minLength={8}
        className="mb-4 block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-11 text-base text-[#000000] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
      />

      <label htmlFor="cnf" className="mb-1.5 block text-sm font-medium text-[#262626]">
        {t("confirm")}
      </label>
      <input
        id="cnf"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        minLength={8}
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
      {success && (
        <div
          role="status"
          className="mb-4 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#15803d]"
        >
          {t("successMessage")}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="block w-full rounded-md bg-[var(--brand-blue-500)] px-4 h-12 text-base font-medium text-white outline-none transition-transform duration-150 hover:bg-[var(--brand-blue-600)] hover:scale-[1.02] active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        {submitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
