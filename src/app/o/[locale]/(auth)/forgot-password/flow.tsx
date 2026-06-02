"use client";

/**
 * Three-state recovery flow on one page:
 *
 *   ENTER_PHONE  → user types phone → POST request → fire SMS
 *   ENTER_CODE   → user types 6-digit code → POST verify → backend rotates pw
 *   SHOW_TEMP_PW → display temp password ONCE, link back to /login
 *
 * The temp password is never stored in localStorage / cookies — only held in
 * component state during the SHOW_TEMP_PW step. After the user clicks "I've
 * saved it → log in" we drop the state and route to /login.
 */

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

type Step = "ENTER_PHONE" | "ENTER_CODE" | "SHOW_TEMP_PW";

interface RequestResp {
  success: boolean;
  data?: { sent: boolean; throttled: boolean; retryAfterSec?: number };
  error?: { code?: string; message?: string };
}

interface VerifyResp {
  success: boolean;
  data?: { tempPassword: string; username: string };
  error?: { code?: string; message?: string };
}

const FIELD_INPUT_CLS =
  "block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-10 text-sm text-[#000000] placeholder:text-[#a3a3a3] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]";

const PRIMARY_BTN_CLS =
  "block w-full rounded-md bg-[var(--brand-blue-500)] px-4 h-11 text-sm font-medium text-white outline-none transition-transform duration-150 hover:bg-[var(--brand-blue-600)] hover:scale-[1.02] active:scale-100 active:bg-[var(--brand-blue-700)] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-200)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100";

export function ForgotPasswordFlow() {
  const t = useTranslations("auth.recovery");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>("ENTER_PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), locale }),
      });
      const json = (await res.json()) as RequestResp;
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? t("errorGeneric"));
        return;
      }
      if (json.data?.throttled) {
        setNotice(
          t("noticeThrottled", { seconds: json.data.retryAfterSec ?? 60 }),
        );
      } else {
        setNotice(t("noticeCodeSent"));
      }
      setStep("ENTER_CODE");
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      const json = (await res.json()) as VerifyResp;
      if (!res.ok || !json.success || !json.data) {
        const errCode = json.error?.code;
        switch (errCode) {
          case "EXPIRED":
            setError(t("errorExpired"));
            setStep("ENTER_PHONE");
            break;
          case "EXHAUSTED":
            setError(t("errorExhausted"));
            setStep("ENTER_PHONE");
            break;
          case "WRONG_CODE":
            setError(t("errorWrongCode"));
            break;
          case "NO_CODE":
            setError(t("errorNoCode"));
            setStep("ENTER_PHONE");
            break;
          default:
            setError(json.error?.message ?? t("errorGeneric"));
        }
        return;
      }
      setTempPassword(json.data.tempPassword);
      setUsername(json.data.username);
      setStep("SHOW_TEMP_PW");
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]">
      {notice && step === "ENTER_CODE" && (
        <div
          role="status"
          className="mb-4 rounded-md border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] px-3 py-2 text-sm text-[var(--brand-blue-700)]"
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]"
        >
          {error}
        </div>
      )}

      {step === "ENTER_PHONE" && (
        <form onSubmit={requestCode} noValidate>
          <p className="mb-4 text-sm text-[#525252]">{t("step1Hint")}</p>
          <div className="mb-4">
            <label
              htmlFor="phone"
              className="mb-1.5 block text-sm font-medium text-[#262626]"
            >
              {t("phoneLabel")}
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="username"
              autoFocus
              placeholder={t("phonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD_INPUT_CLS}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting || phone.trim().length < 4}
            className={PRIMARY_BTN_CLS}
          >
            {submitting ? t("submitting") : t("step1Submit")}
          </button>
        </form>
      )}

      {step === "ENTER_CODE" && (
        <form onSubmit={verifyCode} noValidate>
          <p className="mb-4 text-sm text-[#525252]">
            {t("step2Hint", { phone })}
          </p>
          <div className="mb-4">
            <label
              htmlFor="code"
              className="mb-1.5 block text-sm font-medium text-[#262626]"
            >
              {t("codeLabel")}
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${FIELD_INPUT_CLS} tracking-[0.4em] text-center text-lg`}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className={PRIMARY_BTN_CLS}
          >
            {submitting ? t("submitting") : t("step2Submit")}
          </button>
          <div className="mt-3 text-center">
            <button
              type="button"
              className="text-xs text-[#737373] hover:underline"
              onClick={() => {
                setStep("ENTER_PHONE");
                setCode("");
                setError(null);
                setNotice(null);
              }}
            >
              {t("step2Restart")}
            </button>
          </div>
        </form>
      )}

      {step === "SHOW_TEMP_PW" && (
        <div>
          <p className="mb-2 text-sm text-[#525252]">
            {t("step3Hint", { username })}
          </p>
          <div className="mb-4 rounded-md border-2 border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] p-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--brand-blue-700)]">
              {t("tempPasswordLabel")}
            </div>
            <div className="select-all font-mono text-2xl font-semibold tracking-wider text-[#002A4D]">
              {tempPassword}
            </div>
          </div>
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠️ {t("step3Warning")}
          </div>
          <button
            type="button"
            className={PRIMARY_BTN_CLS}
            onClick={() => router.replace("/o/login")}
          >
            {t("step3Continue")}
          </button>
        </div>
      )}

      <div className="mt-4 text-center text-xs text-[#737373]">
        <Link href="/o/login" className="hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
