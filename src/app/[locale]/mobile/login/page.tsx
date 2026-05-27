"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

export default function MobileLoginPage() {
  const t = useTranslations("mobile");
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      router.replace("/mobile/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f8fb] px-4">
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
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? t("loginSubmitting") : t("loginSubmit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
