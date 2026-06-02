"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { useApiQuery } from "@/lib/api/hooks";

interface Me {
  name: string;
  email: string | null;
  language: "ko" | "vi" | "en";
  smsOptOut: boolean;
  emailOptOut: boolean;
}

interface MeResponse {
  contact: {
    name: string;
    email: string | null;
    language: "ko" | "vi" | "en";
    smsOptOut: boolean | null;
    emailOptOut: boolean | null;
  };
}

export function SettingsClient() {
  const t = useTranslations("portal.settings");
  const { accessToken, contact, refresh } = useCustomerAuth();

  const meQuery = useApiQuery<MeResponse>(
    accessToken ? "/api/portal/auth/me" : null,
  );

  // Initial state mirrors the contact prop; the /me query then enriches it
  // with the opt-out flags once it resolves. User edits are tracked as
  // overrides on top, so refetching does not clobber in-flight typing.
  const baseline = useMemo<Me | null>(() => {
    if (!contact) return null;
    const c = meQuery.data?.contact;
    return {
      name: c?.name ?? contact.name,
      email: c?.email ?? contact.email,
      language: c?.language ?? contact.language,
      smsOptOut: !!c?.smsOptOut,
      emailOptOut: !!c?.emailOptOut,
    };
  }, [contact, meQuery.data]);

  const [overrides, setOverrides] = useState<Partial<Me>>({});
  const me = useMemo<Me | null>(
    () => (baseline ? { ...baseline, ...overrides } : null),
    [baseline, overrides],
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me || !contact) {
    return <p className="py-6 text-center text-sm text-[#737373]">{t("loading")}</p>;
  }

  const update = (patch: Partial<Me>) => {
    setOverrides((prev) => ({ ...prev, ...patch }));
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/portal/contacts/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          name: me.name,
          email: me.email,
          language: me.language,
          smsOptOut: me.smsOptOut,
          emailOptOut: me.emailOptOut,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error?.message ?? t("saveError"));
        return;
      }
      setSaved(true);
      setOverrides({});
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSave} className="space-y-4">
      <h1 className="text-xl font-semibold text-[#002A4D]">{t("title")}</h1>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#737373]">
          {t("profile")}
        </h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#262626]">
            {t("phone")}
          </label>
          <input
            type="text"
            value={contact.phone1}
            disabled
            className="block w-full rounded-md border border-[#e5e5e5] bg-[#f5f5f5] px-3 h-10 text-sm text-[#737373] outline-none"
          />
          <p className="mt-1 text-xs text-[#a3a3a3]">{t("phoneLocked")}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#262626]" htmlFor="name">
            {t("name")}
          </label>
          <input
            id="name"
            type="text"
            value={me.name}
            onChange={(e) => update({ name: e.target.value })}
            className="block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-10 text-sm text-[#000000] outline-none hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#262626]" htmlFor="email">
            {t("email")}
          </label>
          <input
            id="email"
            type="email"
            value={me.email ?? ""}
            onChange={(e) => update({ email: e.target.value || null })}
            className="block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-10 text-sm text-[#000000] outline-none hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#262626]" htmlFor="language">
            {t("language")}
          </label>
          <select
            id="language"
            value={me.language}
            onChange={(e) => update({ language: e.target.value as Me["language"] })}
            className="block w-full rounded-md border border-[#e5e5e5] bg-white px-3 h-10 text-sm text-[#000000] outline-none hover:border-[#a3a3a3] focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#737373]">
          {t("notifications")}
        </h2>
        <p className="text-xs text-[#737373]">{t("notificationsHint")}</p>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={me.smsOptOut}
            onChange={(e) => update({ smsOptOut: e.target.checked })}
            className="mt-0.5 size-4 rounded border-[#a3a3a3] text-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
          />
          <span className="text-sm text-[#262626]">{t("smsOptOut")}</span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={me.emailOptOut}
            onChange={(e) => update({ emailOptOut: e.target.checked })}
            className="mt-0.5 size-4 rounded border-[#a3a3a3] text-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
          />
          <span className="text-sm text-[#262626]">{t("emailOptOut")}</span>
        </label>
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#737373]">
          {t("security")}
        </h2>
        <Link
          href="/change-password"
          className="block rounded-md border border-[#e5e5e5] bg-white px-3 h-10 leading-10 text-sm text-[#262626] outline-none transition-colors hover:border-[var(--brand-blue-500)] hover:bg-[var(--brand-blue-50)]"
        >
          {t("changePassword")}
        </Link>
        {contact.role === "CONTRACT_PARTY" && contact.customerType !== "B2C" && (
          <Link
            href="/contacts"
            className="block rounded-md border border-[#e5e5e5] bg-white px-3 h-10 leading-10 text-sm text-[#262626] outline-none transition-colors hover:border-[var(--brand-blue-500)] hover:bg-[var(--brand-blue-50)]"
          >
            {t("manageContacts")}
          </Link>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </div>
      )}
      {saved && (
        <div role="status" className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#15803d]">
          {t("saved")}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="block w-full rounded-md bg-[var(--brand-blue-500)] px-4 h-12 text-base font-medium text-white outline-none hover:bg-[var(--brand-blue-600)] disabled:opacity-60"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </form>
  );
}
