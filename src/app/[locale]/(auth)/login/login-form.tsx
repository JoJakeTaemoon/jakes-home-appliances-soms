"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";
import { useAuth } from "@/providers/auth-provider";
import { useRouter, Link } from "@/i18n/navigation";

const AUTH_KEYS = ["soms_user", "soms_access", "soms_auth"];

function ErrorIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4M8 11.25v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function LoginForm() {
  const t = useTranslations("auth.login");
  const tCommon = useTranslations("common");
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "", password: "" },
  });

  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      for (const key of AUTH_KEYS) sessionStorage.removeItem(key);
    }
  }, []);

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await login(values.phone ?? "", values.password);
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "UNKNOWN";
      let message: string;
      switch (code) {
        case "INVALID_CREDENTIALS":
          message = t("errorInvalidCredentials");
          break;
        case "ACCOUNT_LOCKED":
          message = t("errorLocked");
          break;
        case "ACCOUNT_INACTIVE":
          message = t("errorInactive");
          break;
        default:
          message = t("errorGeneric");
      }
      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]"
      noValidate
    >
      <div className="mb-4">
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-[#262626]">
          {t("phone")}
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          autoFocus
          placeholder={t("phonePlaceholder")}
          aria-invalid={errors.phone ? "true" : undefined}
          {...register("phone")}
          className="block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-10 text-sm text-[#000000] placeholder:text-[#a3a3a3] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
        />
        {errors.phone && (
          <p className="mt-1 text-xs text-[#dc2626]">{errors.phone.message}</p>
        )}
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
          aria-invalid={errors.password ? "true" : undefined}
          {...register("password")}
          className="block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-10 text-sm text-[#000000] placeholder:text-[#a3a3a3] outline-none transition-colors hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
        />
        {errors.password && (
          <p className="mt-1 text-xs text-[#dc2626]">{errors.password.message}</p>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]"
        >
          <ErrorIcon />
          <span>{serverError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="block w-full rounded-md bg-[var(--brand-blue-500)] px-4 h-11 text-sm font-medium text-white outline-none transition-transform duration-150 hover:bg-[var(--brand-blue-600)] hover:scale-[1.02] active:scale-100 active:bg-[var(--brand-blue-700)] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-200)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        {submitting ? t("submitting") : t("submit")}
      </button>

      <div className="mt-4 text-center">
        <Link
          href="/forgot-password"
          className="text-xs font-medium text-[var(--brand-blue-700)] hover:underline"
        >
          {t("forgotPassword")}
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-[#737373]">
        {tCommon("welcome")} · Seoul Aqua
      </p>
    </form>
  );
}
