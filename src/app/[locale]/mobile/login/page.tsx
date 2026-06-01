"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import {
  useFieldAuth,
  FieldLoginError,
} from "@/providers/field-auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

interface RoleMismatch {
  url: string;
}

export default function MobileLoginPage() {
  const t = useTranslations("mobile");
  const router = useRouter();
  const { login } = useFieldAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<RoleMismatch | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMismatch(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      router.replace("/mobile/today");
    } catch (err) {
      if (err instanceof FieldLoginError && err.code === "ROLE_MISMATCH" && err.suggestedUrl) {
        setMismatch({ url: err.suggestedUrl });
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : t("loginError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goToSuggested = () => {
    if (!mismatch) return;
    const url = new URL(mismatch.url, globalThis.location.origin);
    if (identifier) url.searchParams.set("phone", identifier);
    globalThis.location.assign(url.toString());
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f7f8fb] px-4 py-8">
      <div className="w-full max-w-sm rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-semibold text-[#002A4D]">
            {t("loginTitle")}
          </h1>
          <p className="mt-1 text-sm text-[#737373]">{t("loginSubtitle")}</p>
        </header>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <FormField label={t("loginPhone")} required htmlFor="identifier">
            <Input
              id="identifier"
              autoComplete="username"
              inputMode="tel"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </FormField>
          <FormField label={t("loginPassword")} required htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {mismatch && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-2">{t("loginRoleMismatchOffice")}</p>
              <button
                type="button"
                onClick={goToSuggested}
                className="font-medium text-[var(--brand-blue-700)] underline"
              >
                {t("loginRoleMismatchGoOffice")}
              </button>
            </div>
          )}
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? t("loginSubmitting") : t("loginSubmit")}
          </Button>
          <div className="mt-1 text-center">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[var(--brand-blue-700)] hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
        </form>
      </div>

      <div className="mt-6 flex justify-center">
        <LocaleSwitcher />
      </div>
    </div>
  );
}
