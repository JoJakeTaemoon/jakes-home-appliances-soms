"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  /** `/api/auth/change-password` (office) or `/api/auth/field/change-password`. */
  endpoint: string;
  accessToken: string | null;
  /** The user is on a temp password — explain why, and offer no way out. */
  forced: boolean;
  /** Called after the server accepted the change (refresh the session + navigate). */
  onDone: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Office + field change-password form. Same rules and wording as the portal's
 * `change-password-form.tsx` (its `portal.changePassword` strings are realm-neutral).
 */
export function ChangePasswordForm({ endpoint, accessToken, forced, onDone, onCancel }: Readonly<Props>) {
  const t = useTranslations("portal.changePassword");
  const tAuth = useTranslations("auth");
  const tc = useTranslations("common");

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
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: nextPwd }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const code = json?.error?.code;
        if (code === "WRONG_PASSWORD") setError(t("errorWrongCurrent"));
        else if (code === "PASSWORD_REUSE") setError(t("errorReuse"));
        else setError(t("errorGeneric"));
        return;
      }
      setSuccess(true);
      await onDone();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_4px_12px_rgba(0,113,189,0.06)]"
    >
      <div>
        <h1 className="mb-1 text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="text-sm text-[#525252]">{t("subtitle")}</p>
      </div>
      {forced && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {tAuth("mustChangeNotice")}
        </div>
      )}

      <Field id="cp-current" label={t("current")} autoComplete="current-password" value={current} onChange={setCurrent} />
      <Field id="cp-new" label={t("newPwd")} autoComplete="new-password" value={nextPwd} onChange={setNextPwd} />
      <Field id="cp-confirm" label={t("confirm")} autoComplete="new-password" value={confirm} onChange={setConfirm} />

      {error && (
        <div role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#15803d]">
          {t("successMessage")}
        </div>
      )}

      <Button type="submit" isLoading={submitting} disabled={submitting || success} fullWidth>
        {submitting ? t("submitting") : t("submit")}
      </Button>
      {!forced && onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel} fullWidth>
          {tc("cancel")}
        </Button>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  autoComplete,
  value,
  onChange,
}: Readonly<{ id: string; label: string; autoComplete: string; value: string; onChange: (v: string) => void }>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[#262626]">
        {label}
      </label>
      <Input id={id} type="password" autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
